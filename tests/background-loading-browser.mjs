import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createPreviewServer } from "../scripts/preview.mjs";
import { QUOTES } from "../extension/quotes.js";
import { getContext } from "../extension/context.js";

const server = createPreviewServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const image = await readFile(new URL("../extension/assets/art/autumn-maple.webp", import.meta.url));
const releases = [];
const errors = [];
let browser;

function gate() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  releases.push(release);
  return { promise, release };
}

function quote(id, media) {
  return { ...QUOTES[0], id, provider: "custom", media, art: null };
}

async function pageFor(quotes) {
  const page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  // Supply service-worker replies while exercising the real page/media code.
  await page.addInitScript(({ quotes, context }) => {
    localStorage.setItem("yijian:settings", JSON.stringify({ onlineEnabled: true, language: "zh" }));
    window.selectionCount = 0;
    chrome.runtime = {
      id: "background-test",
      async sendMessage(message) {
        if (message.cacheOnly) return { data: null };
        const selected = quotes[Math.min(window.selectionCount++, quotes.length - 1)];
        return { data: { quote: selected, context, source: "online", status: "online" } };
      },
    };
  }, { quotes, context: getContext() });
  return page;
}

async function flushFrames(page) {
  await page.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  ));
}

try {
  browser = await chromium.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    headless: true,
  });

  const page = await pageFor([quote("online-first", { type: "image", url: `${base}/online.webp` })]);
  const fallback = gate();
  await page.route("**/assets/art/*.webp", async (route) => {
    await fallback.promise;
    await route.continue();
  });
  await page.route("**/online.webp", (route) => route.fulfill({ contentType: "image/webp", body: image }));
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.selectionCount === 1, null, { timeout: 2000 });
  await page.waitForFunction(() => document.getElementById("art").classList.contains("loaded"));
  assert.equal(await page.locator("body").getAttribute("data-quote"), "online-first");
  assert.equal(await page.locator("#art").getAttribute("src"), `${base}/online.webp`);
  assert.equal(await page.locator("#next-button").isEnabled(), true);
  fallback.release();
  await page.waitForFunction(() => performance.getEntriesByType("resource").some((entry) => entry.name.includes("/assets/art/")));
  await flushFrames(page);
  assert.equal(await page.locator("#art").getAttribute("src"), `${base}/online.webp`);
  console.log("PASS Online selection starts before local artwork finishes; late artwork cannot replace it");
  await page.close();

  const switching = await pageFor([
    quote("slow-image", { type: "image", url: `${base}/slow.webp` }),
    quote("fast-image", { type: "image", url: `${base}/fast.webp` }),
  ]);
  const slow = gate();
  await switching.route("**/slow.webp", async (route) => {
    await slow.promise;
    await route.fulfill({ contentType: "image/webp", body: image });
  });
  await switching.route("**/fast.webp", (route) => route.fulfill({ contentType: "image/webp", body: image }));
  await switching.goto(base, { waitUntil: "domcontentloaded" });
  await switching.waitForFunction(() => document.body.dataset.quote === "slow-image");
  assert.equal(await switching.locator("#background-loading").isHidden(), false);
  await switching.locator("#next-button").click({ timeout: 2000 });
  await switching.waitForFunction(() => document.body.dataset.quote === "fast-image" && document.getElementById("art").classList.contains("loaded"));
  slow.release();
  await switching.waitForFunction(() => performance.getEntriesByType("resource").some((entry) => entry.name.endsWith("/slow.webp")));
  await flushFrames(switching);
  assert.equal(await switching.locator("#art").getAttribute("src"), `${base}/fast.webp`);
  console.log("PASS A slow background never blocks switching poems or overwrites a newer background");
  await switching.close();

  // Record a tiny real WebM fixture without requiring FFmpeg or external files.
  const recorderPage = await browser.newPage();
  const video = Buffer.from(await recorderPage.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    canvas.getContext("2d").fillRect(0, 0, 64, 64);
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" });
    const chunks = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start();
    let frame = 0;
    const drawing = setInterval(() => {
      const context = canvas.getContext("2d");
      context.fillStyle = `rgb(0, ${++frame * 10}, 0)`;
      context.fillRect(0, 0, 64, 64);
    }, 50);
    await new Promise((resolve) => setTimeout(resolve, 600));
    clearInterval(drawing);
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
  }));
  await recorderPage.close();

  for (const mode of ["slow-poster", "broken-poster", "broken-video", "both-broken"]) {
    const videoPage = await pageFor([quote(mode, {
      type: "video", url: `${base}/background.webm`, posterUrl: `${base}/poster.webp`,
    })]);
    const poster = gate();
    await videoPage.route("**/poster.webp", async (route) => {
      if (mode === "slow-poster") await poster.promise;
      if (["broken-poster", "both-broken"].includes(mode)) await route.abort();
      else await route.fulfill({ contentType: "image/webp", body: image });
    });
    await videoPage.route("**/background.webm", (route) =>
      ["broken-video", "both-broken"].includes(mode)
        ? route.abort()
        : route.fulfill({ contentType: "video/webm", body: video }),
    );
    await videoPage.goto(base, { waitUntil: "domcontentloaded" });
    if (["slow-poster", "broken-poster"].includes(mode)) {
      await videoPage.waitForFunction(() => {
        const video = document.getElementById("background-video");
        return document.body.dataset.background === "video" && !video.paused && video.currentTime > 0;
      }, null, { timeout: 5000 });
      assert.equal(await videoPage.locator("#background-loading").isHidden(), true);
      assert.equal(await videoPage.locator("#next-button").isEnabled(), true);
      if (mode === "slow-poster") {
        poster.release();
        await videoPage.waitForFunction(() => document.getElementById("art").classList.contains("loaded"));
        assert.equal(await videoPage.locator("body").getAttribute("data-background"), "video");
      }
      console.log(`PASS Video starts independently of ${mode} and keeps playing when the poster settles`);
    } else {
      await videoPage.waitForFunction(() => document.getElementById("background-loading").hidden);
      await videoPage.waitForFunction((expected) => document.body.dataset.background === expected,
        mode === "broken-video" ? "art" : "default");
      assert.equal(await videoPage.locator("#background-video").isHidden(), true);
      console.log(`PASS ${mode} clears loading and falls back to the poster or default background`);
    }
    await videoPage.close();
  }
  assert.deepEqual(errors, []);
} finally {
  releases.forEach((release) => release());
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
