import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createPreviewServer } from "../scripts/preview.mjs";
import { QUOTES } from "../extension/quotes.js";
import { customId } from "../extension/custom.js";

const preview = createPreviewServer().listeners("request")[0];
const image = await readFile(new URL("../extension/assets/art/autumn-maple.webp", import.meta.url));
const requests = [];
const releases = [];
const errors = [];
let items;
let apiGate = null;
let imageGate = null;
let blockedImage = "/media/one.webp";

function gate() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  releases.push(release);
  return { promise, release };
}

const server = createServer(async (req, res) => {
  if (req.url.startsWith("/api/v1/candidates")) {
    requests.push({ type: "api" });
    if (apiGate) await apiGate.promise;
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ items }));
  } else if (req.url.startsWith("/media/")) {
    requests.push({ type: "image", path: req.url, finished: false });
    const record = requests.at(-1);
    if (imageGate && req.url === blockedImage) await imageGate.promise;
    // Real cache headers are essential: Playwright routing disables HTTP caching.
    res.writeHead(200, { "Content-Type": "image/webp", "Cache-Control": "public, max-age=3600" });
    res.end(image);
    record.finished = true;
  } else preview(req, res);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const candidate = (id, video = false) => ({
  ...QUOTES[0], id, status: "published", ready: true,
  background: video
    ? { type: "video", url: `${base}/media/movie.webm`, posterUrl: `${base}/media/${id}.webp` }
    : { type: "image", url: `${base}/media/${id}.webp` },
});
const imageRequests = () => requests.filter((record) => record.type === "image");
let browser;

async function contextFor({ saveData = false } = {}) {
  const context = await browser.newContext();
  await context.addInitScript(({ base, saveData }) => {
    if (location.origin !== base) return;
    if (!localStorage.getItem("yijian:settings"))
      localStorage.setItem("yijian:settings", JSON.stringify({
        onlineEnabled: true, provider: "service", serviceUrl: base, language: "zh",
      }));
    Math.random = () => 0;
    if (saveData) Object.defineProperty(navigator, "connection", { value: { saveData: true } });
    let controller;
    chrome.runtime = {
      id: "background-cache-test",
      async sendMessage(message) {
        controller ||= Promise.all([import("/state.js"), import("/storage.js")])
          .then(([{ createStateController }, { storage }]) => createStateController(storage));
        return { data: await (await controller).handle(message) };
      },
    };
  }, { base, saveData });
  context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
  return context;
}

async function ready(page) {
  await page.waitForFunction(() => document.getElementById("poetry").getAttribute("aria-busy") === "false" &&
    document.getElementById("art").classList.contains("loaded"));
}

async function frames(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function savedDisplay(page, remoteId, key = "last") {
  await page.waitForFunction(async ({ remoteId, key }) => {
    const { readLastDisplay, displayConfigKey } = await import("/display-cache.js");
    const { storage, sanitizeSettings } = await import("/storage.js");
    const saved = await readLastDisplay(displayConfigKey(sanitizeSettings(await storage.get("settings", {}))), key);
    return saved?.quote.remoteId === remoteId && saved.imageData?.startsWith("data:image/");
  }, { remoteId, key });
}

try {
  browser = await chromium.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    headless: true,
  });
  items = [candidate("one"), candidate("two"), candidate("three"), candidate("poster", true)];
  const foreground = gate();
  imageGate = foreground;
  const context = await contextFor();
  const page = await context.newPage();
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.getElementById("poetry").getAttribute("aria-busy") === "false");
  await frames(page);
  assert.deepEqual(imageRequests().map((record) => record.path), ["/media/one.webp"],
    "Speculative images must wait until the current image is loaded");
  const nextImage = gate();
  imageGate = nextImage;
  blockedImage = "/media/two.webp";
  const preloadStarted = page.waitForRequest(`${base}/media/two.webp`);
  foreground.release();
  await ready(page);
  await preloadStarted;
  await frames(page);
  assert.equal(imageRequests().length, 2, "Only one speculative image downloads at a time");
  nextImage.release();
  imageGate = null;
  await page.waitForFunction(() => performance.getEntriesByType("resource").filter((entry) => entry.name.includes("/media/")).length >= 4);
  assert.equal(imageRequests().length, 4);
  assert(!imageRequests().some((record) => record.path.endsWith(".webm")));
  await page.locator("#next-button").click();
  await ready(page);
  assert.equal(await page.locator("#art").getAttribute("src"), `${base}/media/two.webp`);
  assert.equal(imageRequests().length, 4, "Switching to a preloaded background uses HTTP cache");
  await savedDisplay(page, "two");
  await savedDisplay(page, "three", "next");
  console.log("PASS Candidates preload after the foreground image; switching uses HTTP cache without another download");

  await page.evaluate(() => {
    const pool = JSON.parse(localStorage.getItem("yijian:servicePoolState"));
    pool.fetchedAt = Date.now() - 61000;
    localStorage.setItem("yijian:servicePoolState", JSON.stringify(pool));
  });
  apiGate = gate();
  items = [candidate("new")];
  const cachedPage = await context.newPage();
  const localArtwork = [];
  cachedPage.on("request", (request) => {
    if (request.url().includes("/assets/art/")) localArtwork.push(request.url());
  });
  await cachedPage.goto(base, { waitUntil: "domcontentloaded" });
  await ready(cachedPage);
  assert.match(await cachedPage.locator("#art").getAttribute("src"), /^data:image\//);
  assert.equal(await cachedPage.locator("body").getAttribute("data-quote"),
    customId(`${base}/api/v1/recommendation`, "three"), "Startup uses the prepared next poem");
  assert.deepEqual(localArtwork, [], "Warm startup should not flash an unrelated offline illustration");
  assert.equal(imageRequests().length, 4, "New tabs reuse the same cached background files");
  assert.match(await cachedPage.locator("#content-source").innerText(), /最近推荐/);
  await cachedPage.waitForFunction(() => document.body.dataset.quote?.startsWith("custom:"));
  apiGate.release();
  apiGate = null;
  await cachedPage.waitForFunction(() => {
    const pool = JSON.parse(localStorage.getItem("yijian:servicePoolState"));
    return pool.items[0].remoteId === "new";
  });
  await cachedPage.waitForFunction(() => performance.getEntriesByType("resource").some((entry) => entry.name.endsWith("/media/new.webp")));
  await savedDisplay(cachedPage, "new", "next");
  assert.equal(await cachedPage.locator("body").getAttribute("data-quote"), customId(`${base}/api/v1/recommendation`, "three"));
  assert.match(await cachedPage.locator("#art").getAttribute("src"), /^data:image\//);
  assert.equal(imageRequests().length, 5);
  const following = await context.newPage();
  await following.goto(base, { waitUntil: "domcontentloaded" });
  await ready(following);
  assert.equal(await following.locator("body").getAttribute("data-quote"), customId(`${base}/api/v1/recommendation`, "new"));
  assert.match(await following.locator("#art").getAttribute("src"), /^data:image\//);
  console.log("PASS Each new tab uses the prepared next poem and image; replenishment leaves the current tab unchanged");
  await context.close();

  requests.length = 0;
  items = [candidate("one"), candidate("two"), candidate("three")];
  blockedImage = "/media/two.webp";
  imageGate = gate();
  const disabledContext = await contextFor();
  const disabledPage = await disabledContext.newPage();
  const preloading = disabledPage.waitForRequest(`${base}/media/two.webp`);
  await disabledPage.goto(base, { waitUntil: "domcontentloaded" });
  await ready(disabledPage);
  await preloading;
  await disabledPage.locator("#settings-button").click();
  await disabledPage.locator("#online-enabled").uncheck();
  await disabledPage.waitForFunction(() => JSON.parse(localStorage.getItem("yijian:settings")).onlineEnabled === false &&
    document.getElementById("poetry").getAttribute("aria-busy") === "false");
  imageGate.release();
  imageGate = null;
  await frames(disabledPage);
  assert(!imageRequests().some((record) => record.path === "/media/three.webp"));
  console.log("PASS Turning online recommendations off cancels the active preload and its remaining queue");
  await disabledContext.close();

  requests.length = 0;
  const meteredContext = await contextFor({ saveData: true });
  const meteredPage = await meteredContext.newPage();
  await meteredPage.goto(base, { waitUntil: "domcontentloaded" });
  await ready(meteredPage);
  await savedDisplay(meteredPage, "two", "next");
  await frames(meteredPage);
  assert.deepEqual(imageRequests().map((record) => record.path), ["/media/one.webp", "/media/two.webp"]);
  console.log("PASS Data-saving mode prepares one next poem and skips additional speculative images");
  await meteredContext.close();
  assert.deepEqual(errors, []);
} finally {
  releases.forEach((release) => release());
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
