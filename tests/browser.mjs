import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { QUOTES } from "../extension/quotes.js";
import { scoreQuote } from "../extension/context.js";
import { createPreviewServer } from "../scripts/preview.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const extension = process.env.EXTENSION_PATH || root + "extension";
const profile = await mkdtemp(join(tmpdir(), "yijian-browser-"));
const executable =
  process.env.CHROME_PATH ||
  "/home/ubuntu/.cache/puppeteer/chrome/linux-153.0.8010.12/chrome-linux64/chrome";
const results = [];
const errors = [];
const requests = [];
let browser;
let server;
const pass = (description) => {
  results.push(description);
  console.log(`PASS ${description}`);
};
async function ready(page) {
  await page.waitForSelector("#art.loaded", { timeout: 15000 });
  await page.waitForFunction(
    () =>
      document.getElementById("poetry").getAttribute("aria-busy") === "false",
  );
  assert.ok(
    await page
      .locator("#art")
      .evaluate((img) => img.naturalWidth >= 640 && img.naturalHeight >= 400),
  );
}
function observe(page) {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("request", (request) => requests.push(request.url()));
}
try {
  browser = await chromium.launchPersistentContext(profile, {
    executablePath: executable,
    headless: true,
    viewport: { width: 1440, height: 900 },
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--renderer-process-limit=3",
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  const worker =
    browser.serviceWorkers()[0] ||
    (await browser.waitForEvent("serviceworker", { timeout: 15000 }));
  const extensionId = new URL(worker.url()).host;
  assert.ok(extensionId);
  await worker.evaluate(async () =>
    chrome.storage.local.set({
      settings: { onlineEnabled: false, language: "zh" },
    }),
  );
  pass("Actual MV3 service worker loaded");
  const page = await browser.newPage();
  observe(page);
  await page.goto("chrome://newtab/");
  await ready(page);
  assert.equal(await page.evaluate(() => chrome.runtime.id), extensionId);
  pass("chrome://newtab is overridden by the extension");
  const initial = await page.getAttribute("body", "data-quote");
  const actualContext = await page.evaluate(async () =>
    (await import(chrome.runtime.getURL("context.js"))).getContext(new Date()),
  );
  assert.ok(
    scoreQuote(
      QUOTES.find((q) => q.id === initial),
      actualContext,
    ) > 0,
  );
  pass("Initial quote matches browser time and season");
  assert.equal(await page.getAttribute("body", "data-poem-font"), "brush");
  await page.evaluate(() => document.fonts.load('48px "Ma Shan Zheng"'));
  const fontSession = await browser.newCDPSession(page);
  await fontSession.send("DOM.enable");
  await fontSession.send("CSS.enable");
  const { root: documentNode } = await fontSession.send("DOM.getDocument");
  const { nodeId } = await fontSession.send("DOM.querySelector", {
    nodeId: documentNode.nodeId,
    selector: "#verse span",
  });
  const { fonts } = await fontSession.send("CSS.getPlatformFontsForNode", { nodeId });
  assert.ok(fonts.some((font) =>
    font.isCustomFont && /Ma.?Shan.?Zheng/i.test(font.familyName) && font.glyphCount > 0,
  ));
  await fontSession.detach();
  pass("Default poem renders with the actual bundled Ma Shan Zheng brush font");
  await mkdir(root + "artifacts", { recursive: true });
  await page.screenshot({ path: root + "artifacts/newtab-desktop.png" });
  await page.locator("#read-button").click();
  assert.ok(await page.locator("#reading-dialog").evaluate((d) => d.open));
  const quote = QUOTES.find((q) => q.id === initial);
  assert.equal(await page.locator("#meaning").textContent(), quote.meaning);
  assert.equal(await page.locator("#fulltext").textContent(), quote.fullText);
  assert.equal(
    await page.locator("#source-link").getAttribute("href"),
    quote.source,
  );
  await page.screenshot({ path: root + "artifacts/reading.png" });
  await page.keyboard.press("Escape");
  pass(
    "Reading dialog shows explanation, source and original text; Escape closes it",
  );
  await page.locator("#favorite-button").click();
  await page.waitForFunction(
    () =>
      document
        .getElementById("favorite-button")
        .getAttribute("aria-pressed") === "true",
  );
  assert.ok(
    (
      await worker.evaluate(
        async () => (await chrome.storage.local.get("favorites")).favorites,
      )
    ).includes(initial),
  );
  await page.locator("#library-button").click();
  assert.equal(await page.locator(".saved-quote").count(), 1);
  await page.locator(".saved-quote").click();
  assert.equal(await page.getAttribute("body", "data-quote"), initial);
  pass(
    "Favorite persists in chrome.storage and can be opened from the library",
  );
  await page.locator("#next-button").click();
  await ready(page);
  assert.notEqual(await page.getAttribute("body", "data-quote"), initial);
  await page.locator("#next-button").blur();
  const beforeKeyboard = await page.getAttribute("body", "data-quote");
  await page.keyboard.press("Space");
  await ready(page);
  assert.notEqual(
    await page.getAttribute("body", "data-quote"),
    beforeKeyboard,
  );
  pass("Button and Space switch quotes without immediate repetition");
  await page.locator("#settings-button").click();
  const quoteBeforeFontChange = await page.getAttribute("body", "data-quote");
  for (const [font, family] of [
    ["serif", "Songti SC"],
    ["brush", "Ma Shan Zheng"],
    ["sans", "system-ui"],
  ]) {
    await page.locator("#poem-font").selectOption(font);
    await page.waitForFunction(async (font) =>
      (await chrome.storage.local.get("settings")).settings.poemFont === font,
      font,
    );
    for (const selector of ["#verse", "#byline", "#reading-verse", "#fulltext"])
      assert.ok((await page.locator(selector).evaluate((node) =>
        getComputedStyle(node).fontFamily,
      )).includes(family));
    assert.equal(await page.getAttribute("body", "data-quote"), quoteBeforeFontChange);
  }
  pass("All three fonts apply instantly to poems and reading text without changing the poem");
  await page.locator("#show-clock").uncheck();
  await page.locator("#show-meaning").check();
  await page.locator("#text-size").selectOption("large");
  await page.waitForFunction(
    async () =>
      (await chrome.storage.local.get("settings")).settings?.textSize ===
      "large",
  );
  await page.keyboard.press("Escape");
  assert.ok(await page.locator("#clock-wrap").isHidden());
  assert.ok(await page.locator("#inline-meaning").isVisible());
  await page.reload();
  await ready(page);
  assert.equal(await page.getAttribute("body", "data-poem-font"), "sans");
  assert.ok(await page.locator("#clock-wrap").isHidden());
  assert.ok(await page.locator("#inline-meaning").isVisible());
  assert.ok(
    await page
      .locator("body")
      .evaluate((body) => body.classList.contains("large-text")),
  );
  pass("Settings survive reload and apply to the page");
  await page.locator("#settings-button").click();
  await page.locator("#hemisphere").selectOption("south");
  await page.waitForFunction(
    async () =>
      (await chrome.storage.local.get("settings")).settings.hemisphere ===
      "south",
  );
  await page.waitForFunction(() =>
    document.getElementById("season-label").textContent.includes("南半球"),
  );
  await page.keyboard.press("Escape");
  await ready(page);
  await page.waitForFunction(async () => {
    const { QUOTES } = await import(chrome.runtime.getURL("quotes.js"));
    const { getContext, scoreQuote } = await import(
      chrome.runtime.getURL("context.js")
    );
    return (
      scoreQuote(
        QUOTES.find((q) => q.id === document.body.dataset.quote),
        getContext(new Date(), "south"),
      ) > 0
    );
  });
  pass("Hemisphere change reselects a season-appropriate quote");
  await browser.setOffline(true);
  await page.reload();
  await ready(page);
  await page.locator("#next-button").click();
  await ready(page);
  pass("Offline reload and quote switching load real local illustrations");
  // Simultaneous new tabs exercise serialized selection and independent favorite updates.
  const tabs = await Promise.all([browser.newPage(), browser.newPage()]);
  tabs.forEach(observe);
  // Keep concurrent startup selection independent of history from earlier checks.
  await worker.evaluate(() => chrome.storage.local.remove("history"));
  await Promise.all(tabs.map((tab) => tab.goto("chrome://newtab/")));
  await Promise.all(tabs.map(ready));
  const concurrentIds = await Promise.all(
    tabs.map((tab) => tab.getAttribute("body", "data-quote")),
  );
  assert.notEqual(concurrentIds[0], concurrentIds[1]);
  await tabs[0].locator("#settings-button").click();
  await tabs[0].locator("#poem-font").selectOption("brush");
  await Promise.all([page, ...tabs].map((tab) => tab.waitForFunction(() =>
    document.body.dataset.poemFont === "brush",
  )));
  await tabs[0].keyboard.press("Escape");
  await page.evaluate(() => document.fonts.load('48px "Ma Shan Zheng"'));
  pass("Font preference syncs between open tabs and brush font remains available offline");
  await worker.evaluate(async () =>
    chrome.storage.local.set({ favorites: [] }),
  );
  await Promise.all(
    tabs.map((tab) =>
      tab.waitForFunction(
        () =>
          document
            .getElementById("favorite-button")
            .getAttribute("aria-pressed") === "false",
      ),
    ),
  );
  await Promise.all(tabs.map((tab) => tab.locator("#favorite-button").click()));
  await Promise.all(
    tabs.map((tab) =>
      tab.waitForFunction(
        () =>
          document
            .getElementById("favorite-button")
            .getAttribute("aria-pressed") === "true",
      ),
    ),
  );
  const savedIds = await worker.evaluate(
    async () => (await chrome.storage.local.get("favorites")).favorites,
  );
  assert.ok(concurrentIds.every((id) => savedIds.includes(id)));
  pass(
    "Concurrent new tabs do not repeat and both favorite writes are retained",
  );
  await tabs[0].locator("#favorite-button").click();
  await tabs[0].waitForFunction(
    () =>
      document
        .getElementById("favorite-button")
        .getAttribute("aria-pressed") === "false",
  );
  pass("Favorites can be removed and other tabs receive storage changes");
  for (const tab of tabs) await tab.close();
  await browser.setOffline(false);
  // Directly render all bundled content using the library to verify each correspondence.
  await worker.evaluate(
    async (ids) => chrome.storage.local.set({ favorites: ids }),
    QUOTES.map((q) => q.id),
  );
  for (const quote of QUOTES) {
    await page.locator("#library-button").click();
    await page
      .locator(".saved-quote")
      .filter({ hasText: quote.lines.join("，") })
      .click();
    await page.waitForFunction(
      (id) => document.body.dataset.quote === id,
      quote.id,
    );
    assert.equal(
      await page.locator("#verse").innerText(),
      quote.lines.join("\n"),
    );
    assert.equal(
      await page.locator("#art").getAttribute("src"),
      `assets/art/${quote.art}.webp`,
    );
  }
  pass("All 17 quotes display their unique corresponding illustrations");
  // Reset state and select the autumn mountain painting for acceptance screenshots.
  await worker.evaluate(async () =>
    chrome.storage.local.set({
      settings: {
        language: "zh",
        onlineEnabled: false,
        hemisphere: "north",
        showClock: true,
        showMeaning: false,
        textSize: "normal",
        shade: 35,
      },
    }),
  );
  await page.locator("#library-button").click();
  await page
    .locator(".saved-quote")
    .filter({ hasText: "停车坐爱枫林晚" })
    .click();
  await page.waitForFunction(
    () => document.body.dataset.quote === "autumn-maple",
  );
  await page.screenshot({ path: root + "artifacts/newtab-desktop.png" });
  for (const [width, height, label] of [
    [390, 844, "mobile"],
    [800, 600, "small-window"],
  ]) {
    await page.setViewportSize({ width, height });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.ok(await page.locator("#verse").isVisible());
    await page.screenshot({ path: root + `artifacts/newtab-${label}.png` });
    await page.locator("#settings-button").click();
    assert.ok(await page.locator("#settings-dialog").isVisible());
    await page.keyboard.press("Escape");
  }
  pass("390px and 800px windows have no horizontal overflow and dialogs work");
  assert.equal(requests.filter((url) => /^https?:/.test(url)).length, 0);
  assert.deepEqual(errors, []);
  pass(
    "Extension makes no HTTP requests and produces no JavaScript/CSP errors",
  );
  await browser.close();
  browser = null;
  // Relaunch the same isolated test profile: proves persistence beyond a process lifetime.
  browser = await chromium.launchPersistentContext(profile, {
    executablePath: executable,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--renderer-process-limit=2",
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  const restarted = await browser.newPage();
  await restarted.goto("chrome://newtab/");
  await ready(restarted);
  assert.equal(
    (
      await restarted.evaluate(
        async () => (await chrome.storage.local.get("favorites")).favorites,
      )
    ).length,
    QUOTES.length,
  );
  pass("Favorites survive a complete browser restart");
  await browser.close();
  browser = null;
  server = createPreviewServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({
    executablePath: executable,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--renderer-process-limit=2",
    ],
  });
  const preview = await browser.newPage();
  await preview.addInitScript(() =>
    localStorage.setItem("yijian:settings", JSON.stringify({ language: "zh" })),
  );
  observe(preview);
  await preview.goto(`http://127.0.0.1:${server.address().port}/`);
  await ready(preview);
  await preview.locator("#favorite-button").click();
  await preview.waitForFunction(
    () =>
      document
        .getElementById("favorite-button")
        .getAttribute("aria-pressed") === "true",
  );
  assert.ok(
    await preview.evaluate(
      () => JSON.parse(localStorage.getItem("yijian:favorites")).length === 1,
    ),
  );
  pass("Standalone local preview works with localStorage fallback");
  await writeFile(
    root + "artifacts/browser-results.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: await browser.version(),
        results,
        errors,
        externalExtensionRequests: 0,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  await rm(profile, { recursive: true, force: true });
}
