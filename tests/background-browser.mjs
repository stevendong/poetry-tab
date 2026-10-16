import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createPreviewServer } from "../scripts/preview.mjs";

const server = createPreviewServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
let releaseImage;
try {
  browser = await chromium.launch({
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("yijian:settings", JSON.stringify({
      onlineEnabled: false, language: "zh",
    }));
    window.backgroundOpacities = [];
    new MutationObserver(() => {
      const art = document.getElementById("art");
      if (art?.classList.contains("loaded"))
        window.backgroundOpacities.push(Number(getComputedStyle(art).opacity));
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["class"] });
  });
  let blockImages = true;
  let failImages = false;
  await page.route("**/assets/art/*.webp", async (route) => {
    if (blockImages) await new Promise((resolve) => { releaseImage = resolve; });
    if (failImages) await route.abort();
    else await route.continue();
  });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  const loader = page.locator("#background-loading");
  await loader.waitFor({ state: "visible" });
  assert.equal(await loader.evaluate((node) => getComputedStyle(node).opacity), "0");
  await page.waitForFunction(() =>
    Number(getComputedStyle(document.getElementById("background-loading")).opacity) === 1,
  );
  const position = await loader.boundingBox();
  assert.ok(position.x < 40 && position.y > 860, "Loading hint stays in the bottom corner");
  assert.equal(await page.locator("#art").isHidden(), true);
  assert.notEqual(await page.locator(".background-loading-dot").evaluate((node) =>
    getComputedStyle(node).animationName,
  ), "none");
  console.log("PASS Slow images show a delayed, subtle animated loading hint");

  blockImages = false;
  releaseImage();
  await page.waitForFunction(() => window.backgroundOpacities.length > 0);
  assert.ok(await page.evaluate(() => window.backgroundOpacities.some((opacity) => opacity < 0.1)),
    "Revealing an image starts at transparent even after display:none");
  await page.waitForFunction(() => {
    const opacity = Number(getComputedStyle(document.getElementById("art")).opacity);
    return opacity > 0.1 && opacity < 0.95;
  });
  await loader.waitFor({ state: "hidden" });
  await page.waitForFunction(() =>
    getComputedStyle(document.getElementById("art")).opacity === "1",
  );
  await page.waitForFunction(() => !document.getElementById("next-button").disabled);
  console.log("PASS Decoded background visibly fades from transparent to opaque");

  await page.evaluate(() => { window.backgroundOpacities = []; });
  await page.locator("#next-button").click();
  await page.waitForFunction(() => window.backgroundOpacities.length > 0);
  assert.ok(await page.evaluate(() => window.backgroundOpacities.some((opacity) => opacity < 0.1)));
  await loader.waitFor({ state: "hidden" });
  await page.waitForFunction(() => !document.getElementById("next-button").disabled);
  console.log("PASS Switching poems also fades in immediately available images");

  failImages = true;
  await page.locator("#next-button").click();
  await page.waitForFunction(() => document.body.dataset.background === "default" &&
    !document.getElementById("next-button").disabled,
  );
  await loader.waitFor({ state: "hidden" });
  assert.equal(await page.locator("#art").isHidden(), true);
  assert.equal(await page.locator("#toast").textContent(), "插画暂时未能载入，请检查扩展文件是否完整");
  console.log("PASS Image errors clear loading and preserve the default background");

  failImages = false;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator("#next-button").click();
  await page.waitForFunction(() => document.body.dataset.background === "art" &&
    !document.getElementById("next-button").disabled,
  );
  assert.equal(await page.locator("#art").evaluate((node) => getComputedStyle(node).transitionDuration), "0s");
  assert.equal(await page.locator(".background-loading-dot").evaluate((node) =>
    getComputedStyle(node).animationName,
  ), "none");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
  assert.deepEqual(errors, []);
  console.log("PASS Reduced motion and mobile layout remain supported without page errors");
} finally {
  releaseImage?.();
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
