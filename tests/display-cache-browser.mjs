import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPreviewServer } from "../scripts/preview.mjs";
import { QUOTES } from "../extension/quotes.js";
import { customId } from "../extension/custom.js";
import { DEFAULT_SETTINGS } from "../extension/storage.js";
import { displayConfigKey } from "../extension/display-cache.js";

const preview = createPreviewServer().listeners("request")[0];
const image = await readFile(new URL("../extension/assets/art/autumn-maple.webp", import.meta.url));
const directory = await mkdtemp(join(tmpdir(), "yijian-display-cache-"));
const requests = [];
const releases = [];
const errors = [];
let items;
let apiStatus = 200;
let apiGate;
let imageGate;
let blockedImage;
const failedImages = new Set();
let browser;

function gate() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  releases.push(release);
  return { promise, release };
}

const server = createServer(async (req, res) => {
  if (req.url.startsWith("/api/v1/candidates")) {
    requests.push("api");
    if (apiGate) await apiGate.promise;
    res.writeHead(apiStatus, {
      "Content-Type": "application/json", "Cache-Control": "no-store", "Retry-After": "60",
    });
    res.end(JSON.stringify({ items }));
  } else if (req.url.startsWith("/media/")) {
    requests.push(req.url);
    if (imageGate && req.url === blockedImage) await imageGate.promise;
    res.writeHead(failedImages.has(req.url) ? 404 : 200, {
      "Content-Type": "image/webp", "Cache-Control": "no-store",
    });
    res.end(failedImages.has(req.url) ? "Missing image" : image);
  } else preview(req, res);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const config = displayConfigKey({ ...DEFAULT_SETTINGS, serviceUrl: base });
const quoteId = (id) => customId(`${base}/api/v1/recommendation`, id);
const candidate = (id, index = 0) => ({
  ...QUOTES[index], id, status: "published", ready: true,
  background: { type: "image", url: `${base}/media/${id}.webp` },
});

async function launch() {
  browser = await chromium.launchPersistentContext(join(directory, "profile"), {
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    headless: true,
  });
  await browser.addInitScript(({ base }) => {
    if (location.origin !== base) return;
    if (!localStorage.getItem("yijian:settings"))
      localStorage.setItem("yijian:settings", JSON.stringify({
        onlineEnabled: true, provider: "service", serviceUrl: base, language: "zh",
      }));
    Math.random = () => 0;
    Object.defineProperty(navigator, "connection", { value: { saveData: true } });
    let controller;
    chrome.runtime = {
      id: "display-cache-test",
      async sendMessage(message) {
        controller ||= Promise.all([import("/state.js"), import("/storage.js")])
          .then(([{ createStateController }, { storage }]) => createStateController(storage));
        return { data: await (await controller).handle(message) };
      },
    };
  }, { base });
  browser.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
}

async function open() {
  const page = await browser.newPage();
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.getElementById("poetry").getAttribute("aria-busy") === "false" &&
    document.getElementById("art").classList.contains("loaded"));
  return page;
}

async function saved(page, id) {
  await page.waitForFunction(async ({ config, id }) => {
    const snapshot = await (await import("/display-cache.js")).readLastDisplay(config);
    return snapshot?.quote.remoteId === id && snapshot.imageData?.startsWith("data:image/");
  }, { config, id });
}

async function resetCooldown(page) {
  await page.evaluate(() => {
    const pool = JSON.parse(localStorage.getItem("yijian:servicePoolState"));
    pool.retryAt = 0;
    localStorage.setItem("yijian:servicePoolState", JSON.stringify(pool));
  });
}

async function frames(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

try {
  await launch();
  items = [candidate("first")];
  let page = await open();
  await saved(page, "first");
  const firstVerse = await page.locator("#verse").innerText();
  // The API pool can expire; the last successful display has no time limit.
  await page.evaluate(() => {
    const pool = JSON.parse(localStorage.getItem("yijian:servicePoolState"));
    pool.fetchedAt = Date.now() - 86400000;
    localStorage.setItem("yijian:servicePoolState", JSON.stringify(pool));
  });
  await browser.close();
  await launch();
  const http = await browser.newCDPSession(await browser.newPage());
  await http.send("Network.clearBrowserCache");
  failedImages.add("/media/first.webp");
  requests.length = 0;
  apiGate = gate();
  items = [candidate("second", 1)];
  page = await open();
  assert.equal(await page.locator("body").getAttribute("data-quote"), quoteId("first"));
  assert.equal(await page.locator("#verse").innerText(), firstVerse);
  assert.match(await page.locator("#art").getAttribute("src"), /^data:image\//);
  assert(!requests.includes("/media/first.webp"), "Cached image bytes survive a browser restart and an empty HTTP cache");
  console.log("PASS A restarted browser restores the exact last poem and image without contacting its image server");

  imageGate = gate();
  blockedImage = "/media/second.webp";
  const downloading = page.waitForRequest(`${base}/media/second.webp`);
  apiGate.release();
  apiGate = null;
  await downloading;
  await frames(page);
  assert.equal(await page.locator("body").getAttribute("data-quote"), quoteId("first"));
  assert.equal(await page.locator("#verse").innerText(), firstVerse);
  assert.match(await page.locator("#art").getAttribute("src"), /^data:image\//);
  await saved(page, "first");
  imageGate.release();
  imageGate = null;
  await page.waitForFunction((id) => document.body.dataset.quote === id, quoteId("second"));
  await saved(page, "second");
  assert.notEqual(await page.locator("#verse").innerText(), firstVerse);
  assert.equal(await page.locator("#art").getAttribute("src"), `${base}/media/second.webp`);
  console.log("PASS The old poem and background remain visible until the new image decodes, then both update and persist");

  for (const failure of [500, 429, "empty"]) {
    await resetCooldown(page);
    await page.close();
    apiStatus = typeof failure === "number" ? failure : 200;
    items = [];
    page = await open();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("yijian:servicePoolState")).retryAt > Date.now());
    await frames(page);
    assert.equal(await page.locator("body").getAttribute("data-quote"), quoteId("second"));
    assert.match(await page.locator("#art").getAttribute("src"), /^data:image\//);
    await saved(page, "second");
    const count = requests.filter((request) => request === "api").length;
    const another = await open();
    await frames(another);
    assert.equal(requests.filter((request) => request === "api").length, count,
      "Cached startup must still honor API failure cooldowns");
    await another.close();
  }
  console.log("PASS Outages, rate limits and empty results preserve the successful display and honor retry cooldowns");

  await resetCooldown(page);
  await page.close();
  apiStatus = 200;
  items = [candidate("broken", 2)];
  failedImages.add("/media/broken.webp");
  const brokenPage = await browser.newPage();
  const brokenImage = brokenPage.waitForResponse(`${base}/media/broken.webp`);
  await brokenPage.goto(base, { waitUntil: "domcontentloaded" });
  await brokenImage;
  await frames(brokenPage);
  assert.equal(await brokenPage.locator("body").getAttribute("data-quote"), quoteId("second"));
  assert.match(await brokenPage.locator("#art").getAttribute("src"), /^data:image\//);
  await saved(brokenPage, "second");
  await brokenPage.close();
  console.log("PASS A successful poem response with a broken image cannot replace or poison the previous cache");

  apiGate = gate();
  items = [candidate("late", 3)];
  page = await open();
  await page.locator("#read-button").click();
  const response = page.waitForResponse((response) => response.url().includes("/api/v1/candidates"));
  apiGate.release();
  apiGate = null;
  await response;
  await frames(page);
  assert.equal(await page.locator("body").getAttribute("data-quote"), quoteId("second"));
  await saved(page, "second");
  console.log("PASS Opening a poem for reading prevents a late startup refresh from replacing it");

  await page.close();
  items = [candidate("slow-refresh", 4), candidate("manual-next", 5)];
  imageGate = gate();
  blockedImage = "/media/slow-refresh.webp";
  page = await browser.newPage();
  const slowRefresh = page.waitForRequest(`${base}/media/slow-refresh.webp`);
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await slowRefresh;
  await page.locator("#next-button").click();
  await saved(page, "manual-next");
  imageGate.release();
  imageGate = null;
  await page.waitForFunction(() => performance.getEntriesByType("resource").some((entry) =>
    entry.name.endsWith("/media/slow-refresh.webp")));
  await frames(page);
  assert.equal(await page.locator("body").getAttribute("data-quote"), quoteId("manual-next"));
  await saved(page, "manual-next");
  console.log("PASS Manual switching wins over a startup refresh whose image finishes later");

  await page.evaluate(() => {
    localStorage.setItem("yijian:settings", JSON.stringify({ onlineEnabled: false, language: "zh" }));
  });
  await page.close();
  const offline = await open();
  const offlineId = await offline.locator("body").getAttribute("data-quote");
  assert(!offlineId.startsWith("custom:"));
  assert.match(await offline.locator("#art").getAttribute("src"), /^assets\/art\//);
  console.log("PASS Changing source settings or disabling online recommendations does not restore an incompatible display");
  assert.deepEqual(errors, []);
} finally {
  releases.forEach((release) => release());
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
