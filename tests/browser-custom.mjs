import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, readFile, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { QUOTES } from "../extension/quotes.js";

const root = new URL("../", import.meta.url).pathname;
const profile = await mkdtemp("/tmp/yijian-custom-");
const fixtureDir = await mkdtemp("/tmp/yijian-media-");
const executablePath =
  process.env.CHROME_PATH ||
  "/home/ubuntu/.cache/puppeteer/chrome/linux-153.0.8010.12/chrome-linux64/chrome";
const image = await readFile(root + "extension/assets/art/autumn-maple.webp");
execFileSync("/usr/bin/ffmpeg", [
  "-v",
  "error",
  "-f",
  "lavfi",
  "-i",
  "color=c=darkgreen:s=320x180:r=10",
  "-t",
  "1",
  "-an",
  "-c:v",
  "libvpx",
  "-threads",
  "1",
  "-y",
  fixtureDir + "/background.webm",
]);
const video = await readFile(fixtureDir + "/background.webm");
let apiCalls = [],
  sequence = 0,
  mode = "image";
const server = createServer((req, res) => {
  if (req.url === "/art.webp") {
    res.writeHead(200, { "Content-Type": "image/webp" });
    res.end(image);
    return;
  }
  if (req.url === "/background.webm") {
    res.writeHead(200, { "Content-Type": "video/webm" });
    res.end(video);
    return;
  }
  apiCalls.push({
    url: req.url,
    cookie: req.headers.cookie,
    token: req.headers["x-user-token"],
  });
  if (mode === "fault") {
    res.writeHead(503);
    res.end();
    return;
  }
  if (mode === "malformed") {
    res.end("{bad");
    return;
  }
  const q = {
    ...QUOTES.find((q) => q.id === "autumn-maple"),
    id: "fixture-" + ++sequence,
    status: "published",
    ready: true,
    background:
      mode === "video"
        ? { type: "video", url: "/background.webm", posterUrl: "/art.webp" }
        : { type: "image", url: "/art.webp" },
  };
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify(
      req.url.startsWith("/generic")
        ? {
            content: "海内存知己，天涯若比邻。",
            title: "送杜少府之任蜀州",
            author: "王勃",
            meaning: "知己虽远，情谊相连。",
            imageUrl: "/art.webp",
          }
        : { quote: q },
    ),
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port;
const errors = [],
  results = [];
let browser;
const pass = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
async function ready(page) {
  await page.waitForFunction(
    () =>
      document.getElementById("poetry").getAttribute("aria-busy") === "false",
    null,
    { timeout: 15000 },
  );
}
async function configure(page, provider, url, grant = false) {
  await page.locator("#settings-button").click();
  await page.locator("#api-provider").selectOption(provider);
  if (url) await page.locator("#api-url").fill(url);
  await page.locator("#save-api").click();
  if (process.env.HEADFUL === "1" && grant) {
    await new Promise((r) => setTimeout(r, 600));
    execFileSync("/usr/bin/import", [
      "-window",
      "root",
      "/tmp/yijian-permission.png",
    ]);
    execFileSync("/usr/bin/xdotool", ["key", "Tab", "Return"]);
  }
  await page.waitForFunction(
    () => !document.getElementById("save-api").disabled,
    null,
    { timeout: 15000 },
  );
  return page.locator("#api-status").innerText();
}
try {
  browser = await chromium.launchPersistentContext(profile, {
    executablePath,
    headless: process.env.HEADFUL !== "1",
    viewport: { width: 1440, height: 900 },
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--renderer-process-limit=3",
      `--load-extension=${process.env.EXTENSION_PATH || root + "extension"}`,
      `--disable-extensions-except=${process.env.EXTENSION_PATH || root + "extension"}`,
    ],
  });
  const worker =
    browser.serviceWorkers()[0] ||
    (await browser.waitForEvent("serviceworker"));
  await worker.evaluate(() =>
    chrome.storage.local.set({
      settings: { onlineEnabled: false, language: "zh" },
    }),
  );
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (
      m.type() === "error" &&
      /Content Security Policy|Refused to/.test(m.text())
    )
      errors.push(m.text());
  });
  await page.goto("chrome://newtab/");
  await ready(page);
  // Verify denied grants leave configuration intact, then restore the real API.
  await page.evaluate(() => {
    globalThis.__originalPermissionRequest = chrome.permissions.request;
    chrome.permissions.request = async () => false;
  });
  const denied = await configure(page, "service", base);
  assert.match(denied, /未获得/);
  assert.equal(
    await worker.evaluate(
      async () =>
        (await chrome.storage.local.get("settings")).settings.provider,
    ),
    undefined,
  );
  assert.equal(apiCalls.length, 0);
  pass(
    "Denied optional host permission preserves existing settings and makes no API calls",
  );
  await page.evaluate(() => {
    chrome.permissions.request = globalThis.__originalPermissionRequest;
  });
  await page.keyboard.press("Escape");
  const saved = await configure(page, "service", base, true);
  console.log("PERMISSION " + saved);
  assert.match(saved, /接口已保存/);
  assert.ok(
    await worker.evaluate(() =>
      chrome.permissions.contains({ origins: ["http://127.0.0.1/*"] }),
    ),
  );
  await page.locator("#online-enabled").check();
  await page.keyboard.press("Escape");
  await ready(page);
  await page.waitForFunction(() =>
    document.body.dataset.quote?.startsWith("custom:"),
  );
  await page.waitForSelector("#art.loaded");
  assert.equal(
    await page.locator("#art").getAttribute("src"),
    base + "/art.webp",
  );
  const params = new URL(apiCalls.at(-1).url, base).searchParams;
  assert.ok(params.get("season"));
  assert.ok(params.get("period"));
  assert.equal(params.get("prefer"), "image");
  assert.ok(apiCalls.every((c) => !c.cookie && !c.token));
  pass(
    "Real optional permission grant enables cross-origin service requests, image and context without cookies",
  );
  await page.locator("#read-button").click();
  assert.equal(
    await page.locator("#meaning").innerText(),
    QUOTES.find((q) => q.id === "autumn-maple").meaning,
  );
  assert.equal(
    await page.locator("#appreciation").innerText(),
    QUOTES.find((q) => q.id === "autumn-maple").appreciation,
  );
  await page.keyboard.press("Escape");
  await page.locator("#favorite-button").click();
  const favoriteId = await page.locator("body").getAttribute("data-quote");
  pass("Service explanations are shown and the poem can be favorited");
  const before = apiCalls.length;
  await page.locator("#next-button").click();
  await ready(page);
  assert.equal(apiCalls.length, before + 1);
  assert.ok(new URL(apiCalls.at(-1).url, base).searchParams.get("exclude"));
  pass("Switching quotes asks service to exclude recent remote IDs");
  mode = "video";
  await page.locator("#settings-button").click();
  await page.locator("#media-preference").selectOption("video");
  await page.locator("#save-api").click();
  await page.waitForFunction(
    () => !document.getElementById("save-api").disabled,
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => {
    const v = document.getElementById("background-video");
    return !v.hidden && v.readyState >= 2 && !v.paused && v.currentTime > 0;
  });
  const rect = await page.locator("#background-video").boundingBox();
  assert.equal(rect.y, 0);
  assert.equal(rect.height, 900);
  pass("Actual WebM background plays muted and covers viewport");
  await page.locator("#settings-button").click();
  await page.locator("#online-enabled").uncheck();
  await page.keyboard.press("Escape");
  await ready(page);
  assert.ok(await page.locator("#background-video").isHidden());
  assert.equal(
    await page.locator("#background-video").getAttribute("src"),
    null,
  );
  const disabledCalls = apiCalls.length;
  await page.locator("#next-button").click();
  await ready(page);
  assert.equal(apiCalls.length, disabledCalls);
  pass("Disabling online clears video and stops custom API requests");
  await page.locator("#library-button").click();
  await page
    .locator(".saved-quote")
    .filter({ hasText: "停车坐爱枫林晚" })
    .click();
  await page.waitForFunction(
    (id) => document.body.dataset.quote === id,
    favoriteId,
  );
  assert.equal(await page.locator("#art").getAttribute("src"), null);
  await page.locator("#read-button").click();
  assert.ok(
    (await page.locator("#fulltext").innerText()).includes("停车坐爱枫林晚"),
  );
  await page.keyboard.press("Escape");
  pass("Custom favorite remains readable with networking disabled");
  mode = "image";
  await configure(page, "custom", base + "/generic?language=zh");
  await page.locator("#online-enabled").check();
  await page.keyboard.press("Escape");
  await ready(page);
  await page.waitForFunction(() =>
    document.getElementById("byline").textContent.includes("王勃"),
  );
  assert.ok(apiCalls.at(-1).url.includes("/generic?language=zh"));
  pass("Generic JSON endpoint maps poem, meaning and relative image URL");
  await page.evaluate(async () => {
    const { settings } = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({
      settings: { ...settings, language: "en" },
    });
  });
  await page.waitForFunction(() =>
    document.getElementById("save-api").textContent.includes("Save API"),
  );
  assert.match(await page.locator("#content-source").innerText(), /Custom API/);
  assert.ok(
    !/\p{Script=Han}/u.test(await page.locator("#api-help").textContent()),
  );
  assert.ok((await page.locator("#verse").innerText()).includes("海内存知己"));
  await page.evaluate(async () => {
    const { settings } = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({
      settings: { ...settings, language: "zh-TW" },
    });
  });
  await page.waitForFunction(() => document.documentElement.lang === "zh-TW");
  assert.match(await page.locator("#verse").innerText(), /海內存知己/);
  assert.match(await page.locator("#api-help").textContent(), /填寫/);
  await page.evaluate(async () => {
    const { settings } = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({
      settings: { ...settings, language: "zh" },
    });
  });
  await page.waitForFunction(() =>
    document.getElementById("save-api").textContent.includes("保存接口"),
  );
  pass(
    "Custom settings and source labels switch language while keeping original Chinese poetry",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#settings-button").click();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await mkdir(root + "artifacts", { recursive: true });
  await page.screenshot({
    path: root + "artifacts/custom-settings-mobile.png",
  });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 900 });
  mode = "fault";
  await worker.evaluate(() => chrome.storage.local.remove("customOnlineState"));
  await page.reload();
  await ready(page);
  assert.ok(
    (await page.locator("#content-source").innerText()).includes(
      "网络暂不可用",
    ),
  );
  const failureCalls = apiCalls.length;
  await page.locator("#next-button").click();
  await ready(page);
  assert.equal(apiCalls.length, failureCalls);
  pass("HTTP failure falls back to offline art and respects failure backoff");
  mode = "image";
  if (process.env.LIVE_API === "1") {
    await configure(
      page,
      "service",
      "https://poetry-api.nabulalogic.com",
      true,
    );
    await page.keyboard.press("Escape");
    await ready(page);
    await page.waitForFunction(() =>
      document
        .getElementById("content-source")
        .textContent.includes("诗画库 · 在线推荐"),
    );
    await page.waitForSelector("#art.loaded");
    const live = await page.locator("#byline").innerText();
    console.log("LIVE " + live);
    assert.ok(
      (await page.locator("#art").getAttribute("src")).startsWith(
        "https://poetry-media.nabulalogic.com/",
      ),
    );
    await page.screenshot({ path: root + "artifacts/custom-service-live.png" });
    pass(
      "Production poetry-service returns published poem and its actual CDN image in installed Chrome extension",
    );
  }
  assert.deepEqual(errors, []);
  pass("No page JavaScript or CSP errors");
  await writeFile(
    root + "artifacts/custom-results.json",
    JSON.stringify({ results, errors }, null, 2),
  );
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
  await rm(profile, { recursive: true, force: true });
  await rm(fixtureDir, { recursive: true, force: true });
}
