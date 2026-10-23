import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const extension = fileURLToPath(new URL("../extension", import.meta.url));
const profile = await mkdtemp(join(tmpdir(), "yijian-specified-"));
const image = await readFile(new URL("../extension/assets/art/autumn-maple.webp", import.meta.url));
const errors = [];
let browser;

async function openSettings(page) {
  if (!await page.locator("#settings-dialog").evaluate((dialog) => dialog.open))
    await page.locator("#settings-button").click();
}

async function load(page, id) {
  await openSettings(page);
  await page.locator("#specified-id").fill(id);
  await page.locator("#specified-load").click();
  await page.waitForFunction(() => !document.getElementById("specified-load").disabled);
}

try {
  browser = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROME_PATH || chromium.executablePath(), headless: true,
    viewport: { width: 1440, height: 900 },
    args: [`--load-extension=${extension}`, `--disable-extensions-except=${extension}`],
  });
  const worker = browser.serviceWorkers()[0] || await browser.waitForEvent("serviceworker");
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ settings: { language: "zh", provider: "jinrishici", onlineEnabled: true } });
    globalThis.__specifiedCalls = [];
    globalThis.fetch = async (url, options) => {
      const path = new URL(url).pathname;
      if (!path.includes("/quotations/")) return new Response("offline", { status: 503 });
      globalThis.__specifiedCalls.push({ url, credentials: options.credentials, headers: options.headers });
      const id = path.split("/").at(-1);
      if (id === "missing") return new Response("not found", { status: 404 });
      const response = () => new Response(JSON.stringify({
        id, status: "published", ready: true, title: "秋思", author: "张籍", dynasty: "唐",
        lines: ["洛阳城里见秋风", "欲作家书意万重"],
        fullText: "洛阳城里见秋风，欲作家书意万重。复恐匆匆说不尽，行人临发又开封。",
        meaning: "秋风吹起，想念家乡。", appreciation: "以秋风引出乡思。",
        background: { type: "image", url: "https://poetry-media.nabulalogic.com/test/specified.webp" },
        media: id === "video-no-poster" ? [
          { type: "video", url: "https://poetry-media.nabulalogic.com/test/specified.webm", posterUrl: null },
        ] : [],
      }));
      if (id === "slow") return new Promise((resolve) => { globalThis.__releaseSpecified = () => resolve(response()); });
      return response();
    };
  });
  const page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/test/specified.webp", (route) => route.fulfill({ contentType: "image/webp", body: image }));
  await page.goto("chrome://newtab/");
  await page.waitForFunction(() => document.getElementById("poetry").getAttribute("aria-busy") === "false");
  const settings = await worker.evaluate(async () => (await chrome.storage.local.get("settings")).settings);

  await load(page, "specific-id");
  await page.waitForFunction(() => !document.getElementById("settings-dialog").open && document.getElementById("art").classList.contains("loaded"));
  const loaded = await page.locator("body").getAttribute("data-quote");
  assert.match(loaded, /^custom:/);
  assert.match(await page.locator("#content-source").innerText(), /诗画库.*指定加载/);
  assert.match(await page.locator("#verse").innerText(), /洛阳城里见秋风/);
  assert.equal(await page.locator("#art").getAttribute("src"), "https://poetry-media.nabulalogic.com/test/specified.webp");
  assert.deepEqual(await worker.evaluate(async () => (await chrome.storage.local.get("settings")).settings), settings);
  const calls = await worker.evaluate(() => globalThis.__specifiedCalls);
  assert.equal(new URL(calls[0].url).pathname, "/api/v1/quotations/specific-id");
  assert.equal(calls[0].credentials, "omit");
  assert.equal(calls[0].headers, undefined);
  await page.locator("#read-button").click();
  assert.match(await page.locator("#fulltext").innerText(), /复恐匆匆说不尽/);
  await page.keyboard.press("Escape");
  await page.locator("#favorite-button").click();
  await page.waitForFunction(() => document.getElementById("favorite-button").getAttribute("aria-pressed") === "true");
  assert.ok(await worker.evaluate(async (id) => (await chrome.storage.local.get("favoriteSnapshots")).favoriteSnapshots[id], loaded));
  console.log("PASS Loading by ID displays the exact poem, original and background; favorites work and default source is unchanged");

  await load(page, "missing");
  assert.match(await page.locator("#specified-status").innerText(), /未找到.*尚未公开/);
  assert.equal(await page.locator("body").getAttribute("data-quote"), loaded);
  const beforeInvalid = await worker.evaluate(() => globalThis.__specifiedCalls.length);
  await load(page, "../invalid");
  assert.match(await page.locator("#specified-status").innerText(), /有效的诗句 ID/);
  assert.equal(await worker.evaluate(() => globalThis.__specifiedCalls.length), beforeInvalid);
  await page.evaluate(() => {
    globalThis.__originalPermission = chrome.permissions.request;
    chrome.permissions.request = async () => false;
  });
  await load(page, "denied");
  assert.match(await page.locator("#specified-status").innerText(), /未获得.*访问权限/);
  assert.equal(await worker.evaluate(() => globalThis.__specifiedCalls.length), beforeInvalid);
  assert.equal(await page.locator("body").getAttribute("data-quote"), loaded);
  await page.evaluate(() => { chrome.permissions.request = globalThis.__originalPermission; });
  console.log("PASS Missing IDs, invalid IDs and denied site access preserve the current poem and settings");

  await page.setViewportSize({ width: 375, height: 812 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
  await page.locator("#language").click();
  await page.locator("#language-options [data-value='en']").click();
  assert.equal(await page.locator("#specified-load").innerText(), "Load poem");
  await page.locator("#specified-id").fill("specific-id");
  await page.locator("#specified-id").press("Enter");
  await page.waitForFunction(() => !document.getElementById("settings-dialog").open);
  console.log("PASS Specified loading supports narrow windows, translated controls and Enter to load");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    globalThis.__originalSend = chrome.runtime.sendMessage;
    chrome.runtime.sendMessage = async (message) => {
      if (message.type === "select" && !message.cacheOnly && !message.refreshOnly && !message.prepareNext)
        return new Promise((resolve) => { globalThis.__releaseAuto = () => resolve({ error: "late automatic failure" }); });
      return globalThis.__originalSend(message);
    };
  });
  await page.locator("#next-button").click();
  await page.waitForFunction(() => Boolean(globalThis.__releaseAuto));
  await load(page, "another-id");
  const another = await page.locator("body").getAttribute("data-quote");
  assert.notEqual(another, loaded);
  await page.evaluate(() => { globalThis.__releaseAuto(); chrome.runtime.sendMessage = globalThis.__originalSend; });
  await page.waitForFunction(() => !document.getElementById("next-button").disabled);
  assert.equal(await page.locator("body").getAttribute("data-quote"), another);
  console.log("PASS A late failed automatic selection cannot overwrite a manually loaded poem");

  await openSettings(page);
  await page.locator("#specified-id").fill("slow");
  await page.locator("#specified-load").click();
  await worker.evaluate(() => new Promise((resolve, reject) => {
    let attempts = 0;
    const timer = setInterval(() => {
      if (globalThis.__releaseSpecified || ++attempts > 250) {
        clearInterval(timer);
        if (globalThis.__releaseSpecified) resolve();
        else reject(new Error("Manual request did not start"));
      }
    }, 20);
  }));
  await page.keyboard.press("Escape");
  await page.locator("#read-button").click();
  await worker.evaluate(() => globalThis.__releaseSpecified());
  await page.waitForFunction(() => !document.getElementById("specified-load").disabled);
  assert.equal(await page.locator("body").getAttribute("data-quote"), another);
  assert.equal(await page.locator("#reading-dialog").evaluate((dialog) => dialog.open), true);
  await page.keyboard.press("Escape");
  await page.locator("#next-button").click();
  await page.waitForFunction(() => document.getElementById("poetry").getAttribute("aria-busy") === "false");
  assert.notEqual(await page.locator("body").getAttribute("data-quote"), another);
  assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get("settings")).settings.provider), "jinrishici");
  console.log("PASS Late manual responses preserve active reading; Next poem resumes the saved recommendation source");

  const video = Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" });
    const chunks = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start();
    const drawing = setInterval(() => canvas.getContext("2d").fillRect(0, 0, 64, 64), 50);
    await new Promise((resolve) => setTimeout(resolve, 600));
    clearInterval(drawing);
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
  }));
  await page.route("**/test/specified.webm", (route) => route.fulfill({ contentType: "video/webm", body: video }));
  await worker.evaluate(async () => {
    const { settings } = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({ settings: { ...settings, mediaPreference: "video" } });
  });
  await page.waitForFunction(() => document.getElementById("media-preference").value === "video");
  await load(page, "video-no-poster");
  const playingVideo = () => {
    const video = document.getElementById("background-video");
    return document.body.dataset.background === "video" && !video.paused && video.currentTime > 0;
  };
  await page.waitForFunction(playingVideo);
  assert.equal(await page.locator("#background-video").getAttribute("poster"), "https://poetry-media.nabulalogic.com/test/specified.webp");
  await page.locator("#favorite-button").click();
  await page.waitForFunction(() => document.getElementById("favorite-button").getAttribute("aria-pressed") === "true");
  await page.locator("#next-button").click();
  await page.waitForFunction(() => document.getElementById("poetry").getAttribute("aria-busy") === "false");
  await page.locator("#library-button").click();
  await page.locator("#library-list .saved-quote").first().click();
  await page.waitForFunction(playingVideo);
  console.log("PASS A video with a null poster plays using its quotation image, including when reopened from favorites");
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await rm(profile, { recursive: true, force: true });
}
