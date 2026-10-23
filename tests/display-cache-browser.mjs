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
    window.finishedPreparations = 0;
    window.displayedQuotes = [];
    new MutationObserver((records) => {
      for (const record of records)
        if (record.attributeName === "data-quote") window.displayedQuotes.push(record.target.dataset.quote);
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-quote"] });
    let controller;
    chrome.runtime = {
      id: "display-cache-test",
      async sendMessage(message) {
        controller ||= Promise.all([import("/state.js"), import("/storage.js")])
          .then(([{ createStateController }, { storage }]) => createStateController(storage));
        try {
          return { data: await (await controller).handle(message) };
        } finally {
          if (message.prepareNext) window.finishedPreparations++;
        }
      },
    };
  }, { base });
  browser.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
}

async function ready(page) {
  await page.waitForFunction(() => document.getElementById("poetry").getAttribute("aria-busy") === "false" &&
    document.getElementById("art").classList.contains("loaded"));
}

async function open() {
  const page = await browser.newPage();
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await ready(page);
  return page;
}

async function saved(page, id, key = "next") {
  await page.waitForFunction(async ({ config, id, key }) => {
    const snapshot = await (await import("/display-cache.js")).readLastDisplay(config, key);
    return snapshot?.quote.remoteId === id && snapshot.imageData?.startsWith("data:image/");
  }, { config, id, key });
}

async function resetPreparation(page) {
  await page.evaluate(async () => {
    const pool = JSON.parse(localStorage.getItem("yijian:servicePoolState"));
    pool.fetchedAt = Date.now() - 86400000;
    pool.retryAt = 0;
    localStorage.setItem("yijian:servicePoolState", JSON.stringify(pool));
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("yijian-display", 1);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction("display", "readwrite");
        transaction.objectStore("display").delete("next");
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

async function steady(page, id) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator("body").getAttribute("data-quote"), quoteId(id));
  assert.deepEqual(await page.evaluate(() => [...new Set(window.displayedQuotes)]), [quoteId(id)],
    "A warm tab must display one poem without an offline flash or an automatic replacement");
  assert.match(await page.locator("#art").getAttribute("src"), /^data:image\//);
}

try {
  await launch();
  items = [candidate("first"), candidate("second", 1)];
  let page = await open();
  await saved(page, "first", "last");
  await saved(page, "second");
  assert.equal(await page.locator("body").getAttribute("data-quote"), quoteId("first"));
  assert.deepEqual(await page.evaluate(() => [...new Set(window.displayedQuotes)]), [quoteId("first")],
    "Cold startup should also display only one poem");
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("yijian:history"))), [quoteId("first")]);
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
  failedImages.add("/media/second.webp");
  requests.length = 0;
  apiGate = gate();
  items = [candidate("third", 2), candidate("fourth", 3), candidate("fifth", 4)];
  page = await open();
  await steady(page, "second");
  assert(!requests.includes("/media/second.webp"), "The prepared image survives a browser restart and an empty HTTP cache");
  console.log("PASS The first tab prepares its second poem; the next tab restores it immediately after a browser restart");

  imageGate = gate();
  blockedImage = "/media/third.webp";
  const downloading = page.waitForRequest(`${base}/media/third.webp`);
  apiGate.release();
  apiGate = null;
  await downloading;
  await steady(page, "second");
  imageGate.release();
  imageGate = null;
  await saved(page, "third");
  await steady(page, "second");
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("yijian:history"))),
    [quoteId("first"), quoteId("second")], "Preparing a poem must not mark it as already shown");
  const thirdRequests = requests.filter((request) => request === "/media/third.webp").length;
  const third = await open();
  await saved(third, "fourth");
  await steady(third, "third");
  assert.equal(requests.filter((request) => request === "/media/third.webp").length, thirdRequests);
  await steady(page, "second");
  console.log("PASS Completing background preparation never changes an open tab; the following tab uses the prepared poem and image");

  imageGate = gate();
  blockedImage = "/media/fifth.webp";
  const fourth = await browser.newPage();
  const fifthDownload = fourth.waitForRequest(`${base}/media/fifth.webp`);
  await fourth.goto(base, { waitUntil: "domcontentloaded" });
  await ready(fourth);
  await fifthDownload;
  const rapid = await Promise.all([open(), open()]);
  for (const tab of [fourth, ...rapid]) await steady(tab, "fourth");
  imageGate.release();
  imageGate = null;
  await saved(fourth, "fifth");
  for (const tab of rapid) await steady(tab, "fourth");
  console.log("PASS Rapid concurrent tabs use an immediate fallback while one shared preparation fills the next slot");
  for (const tab of browser.pages()) if (tab !== fourth) await tab.close();
  page = fourth;

  for (const failure of [500, 429, "empty"]) {
    await resetPreparation(page);
    await page.close();
    apiStatus = typeof failure === "number" ? failure : 200;
    items = [];
    page = await open();
    await page.waitForFunction(() => window.finishedPreparations > 0);
    await steady(page, "fourth");
    const count = requests.filter((request) => request === "api").length;
    const another = await open();
    await another.waitForFunction(() => window.finishedPreparations > 0);
    await steady(another, "fourth");
    assert.equal(requests.filter((request) => request === "api").length, count);
    await another.close();
  }
  console.log("PASS Failed, rate-limited and empty preparations keep cached startup available and honor retry cooldowns");

  await resetPreparation(page);
  await page.close();
  apiStatus = 200;
  items = [candidate("broken", 5)];
  failedImages.add("/media/broken.webp");
  page = await browser.newPage();
  const broken = page.waitForResponse(`${base}/media/broken.webp`);
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await ready(page);
  await broken;
  await steady(page, "fourth");
  assert.equal(await page.evaluate(async (config) =>
    (await import("/display-cache.js")).readLastDisplay(config, "next"), config), null);
  await saved(page, "fourth", "last");
  console.log("PASS A broken second image cannot become the next startup cache or replace the current display");

  await resetPreparation(page);
  await page.close();
  items = [candidate("slow-next", 6)];
  imageGate = gate();
  blockedImage = "/media/slow-next.webp";
  page = await browser.newPage();
  const slow = page.waitForRequest(`${base}/media/slow-next.webp`);
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await ready(page);
  await slow;
  items = [candidate("manual", 7), candidate("after-manual", 8)];
  await resetPreparation(page);
  await page.locator("#next-button").click();
  await saved(page, "manual", "last");
  imageGate.release();
  imageGate = null;
  await saved(page, "after-manual");
  assert.equal(await page.locator("body").getAttribute("data-quote"), quoteId("manual"));
  console.log("PASS Manual switching cancels stale preparation and prepares a successor for the newly selected poem");

  await page.evaluate(() => {
    localStorage.setItem("yijian:settings", JSON.stringify({ onlineEnabled: false, language: "zh" }));
  });
  await page.close();
  const offline = await open();
  const offlineId = await offline.locator("body").getAttribute("data-quote");
  assert(!offlineId.startsWith("custom:"));
  assert.match(await offline.locator("#art").getAttribute("src"), /^assets\/art\//);
  console.log("PASS Source changes and offline mode reject incompatible prepared poems");
  assert.deepEqual(errors, []);
} finally {
  releases.forEach((release) => release());
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
