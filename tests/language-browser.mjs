import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPreviewServer } from "../scripts/preview.mjs";
import { QUOTES } from "../extension/quotes.js";
import { toTraditional } from "../extension/chinese.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const profile = await mkdtemp(join(tmpdir(), "yijian-language-"));
const executablePath = process.env.CHROME_PATH || chromium.executablePath();
const errors = [];
let browser;
let server;
async function ready(page) {
  await page.waitForFunction(
    () =>
      document.body.dataset.quote &&
      document.getElementById("poetry").getAttribute("aria-busy") === "false",
  );
}
async function pickLanguage(page, value) {
  await page.locator("#language").click();
  await page.locator(`#language-options [data-value='${value}']`).click();
  await page.waitForFunction(
    (value) =>
      document.documentElement.lang ===
      (value === "zh" ? "zh-CN" : value === "zh-TW" ? "zh-TW" : "en-US"),
    value,
  );
}
async function savedSettings(page) {
  return page.evaluate(async () =>
    globalThis.chrome?.runtime?.id
      ? (await chrome.storage.local.get("settings")).settings
      : JSON.parse(localStorage.getItem("yijian:settings")),
  );
}
async function verify(page, url, label) {
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date("2026-10-14T12:00:00+08:00"));
  await page.goto(url);
  await ready(page);
  assert.equal(await page.locator("html").getAttribute("lang"), "en-US");
  assert.equal(await page.locator(".brand-name").textContent(), "Yijian");
  assert.match(await page.locator("#date-label").textContent(), /Oct 14/);
  assert.equal(await page.locator("#verse").getAttribute("lang"), "zh-CN");
  assert.match(await page.locator("#verse").innerText(), /\p{Script=Han}/u);
  await page
    .getByRole("button", { name: "Open favorites", exact: true })
    .click();
  assert.equal(
    await page.locator("#library-count").textContent(),
    "0 saved poems",
  );
  assert.match(
    await page.locator(".empty-library").textContent(),
    /No favorites yet/,
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Save this poem", exact: true })
    .click();
  await page.waitForFunction(
    () => document.getElementById("favorite-label").textContent === "Saved",
  );
  assert.equal(
    await page.locator("#toast").textContent(),
    "Saved to favorites",
  );
  const quoteBefore = await page.locator("body").getAttribute("data-quote");
  const artBefore = await page.locator("#art").getAttribute("src");
  const verseBefore = await page.locator("#verse").innerText();
  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
  assert.equal(
    await page.locator("#settings-title").textContent(),
    "Preferences",
  );
  assert.equal(
    await page.locator(".settings-sheet .sheet-kicker").textContent(),
    "Make room for poetry",
  );
  await page.locator("#language").focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
  assert.equal(await page.locator("#settings-title").textContent(), "偏好设置");
  await pickLanguage(page, "en");
  assert.equal(
    await page.locator("body").getAttribute("data-quote"),
    quoteBefore,
  );
  assert.equal(await page.locator("#art").getAttribute("src"), artBefore);
  assert.equal(await page.locator("#verse").innerText(), verseBefore);
  await page.waitForFunction(async () => {
    const settings = globalThis.chrome?.runtime?.id
      ? (await chrome.storage.local.get("settings")).settings
      : JSON.parse(localStorage.getItem("yijian:settings"));
    return settings?.language === "en";
  });
  assert.equal((await savedSettings(page)).language, "en");
  await page.screenshot({
    path: root + `artifacts/language-${label}-settings.png`,
  });
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Read this poem", exact: true })
    .click();
  assert.equal(
    await page.locator("#meaning-heading").textContent(),
    "Meaning (Chinese)",
  );
  assert.equal(
    await page.locator("#fulltext-label").textContent(),
    QUOTES.find((quote) => quote.id === quoteBefore).excerpt
      ? "Excerpt"
      : "Original text",
  );
  assert.match(
    await page.locator("#fulltext").textContent(),
    /\p{Script=Han}/u,
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Open favorites", exact: true })
    .click();
  assert.equal(
    await page.locator("#library-count").textContent(),
    "1 saved poem",
  );
  await page.keyboard.press("Escape");
  await page.reload();
  await ready(page);
  assert.equal(await page.locator("html").getAttribute("lang"), "en-US");
  await page.evaluate(() => document.fonts.ready);
  await page
    .locator("#poetry")
    .evaluate((element) =>
      Promise.all(
        element.getAnimations().map((animation) => animation.finished),
      ),
    );
  await page.screenshot({
    path: root + `artifacts/language-${label}-desktop.png`,
  });
  await page
    .getByRole("button", { name: "Open calendar", exact: true })
    .click();
  assert.equal(await page.locator("#calendar-title").textContent(), "Calendar");
  assert.equal(await page.locator("#calendar-month").textContent(), "Oct");
  assert.equal(await page.locator("#calendar-year").textContent(), "2026");
  assert.match(
    await page.locator("#calendar-selected-lunar").textContent(),
    /Year of the Horse.*Month 9, day 5/,
  );
  assert.match(
    await page.locator("#calendar-terms").textContent(),
    /Cold Dew Oct 8.*Frost Oct 23/,
  );
  await page.locator("[data-date='2026-10-08']").click();
  assert.equal(
    await page.locator("#calendar-selected-term").textContent(),
    "Cold Dew",
  );
  assert.equal(
    await page
      .locator("[data-date='2026-10-08'] .calendar-lunar")
      .textContent(),
    "Term",
  );
  assert.match(
    await page.locator("[data-date='2026-10-08']").getAttribute("aria-label"),
    /Chinese lunar date: Month 8, day 28.*Cold Dew/,
  );
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page
        .locator("#calendar-dialog")
        .evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth),
    );
    await page.locator("#calendar-month").click();
    assert.ok(
      await page
        .locator("#calendar-month-options")
        .evaluate((menu) => menu.getBoundingClientRect().right <= innerWidth),
    );
    await page.locator("#calendar-month-options [data-value='9']").click();
    await page.screenshot({
      path: root + `artifacts/language-${label}-calendar-${width}.png`,
    });
    await page.keyboard.press("Escape");
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page
      .getByRole("button", { name: "Open settings", exact: true })
      .click();
    assert.ok(
      await page
        .locator("#settings-dialog")
        .evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth),
    );
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Open calendar", exact: true })
      .click();
  }
  await page.keyboard.press("Escape");
  const second = await page.context().newPage();
  await second.goto(url);
  await ready(second);
  assert.equal(await second.locator("html").getAttribute("lang"), "en-US");
  await second.locator("#almanac-button").click();
  await page.locator("#settings-button").click();
  await pickLanguage(page, "zh");
  await second.waitForFunction(() => document.documentElement.lang === "zh-CN");
  assert.equal(await second.locator("#calendar-title").textContent(), "万年历");
  assert.equal(await second.locator("#calendar-month").textContent(), "10月");
  const originalId = await page.locator("body").getAttribute("data-quote");
  const originalQuote = QUOTES.find((quote) => quote.id === originalId);
  const originalArt = await page.locator("#art").getAttribute("src");
  const originalSource = await page
    .locator("#source-link")
    .getAttribute("href");
  const historyBefore = await page.evaluate(async () =>
    globalThis.chrome?.runtime?.id
      ? (await chrome.storage.local.get("history")).history
      : JSON.parse(localStorage.getItem("yijian:history")),
  );
  await pickLanguage(page, "zh-TW");
  await second.waitForFunction(() => document.documentElement.lang === "zh-TW");
  assert.equal(await page.locator("#settings-title").textContent(), "偏好設置");
  assert.equal(await page.locator(".brand-name").textContent(), "一箋");
  assert.equal(await page.locator(".seal").textContent(), "箋");
  assert.equal(
    await page.locator("body").getAttribute("data-quote"),
    originalId,
  );
  assert.equal(await page.locator("#art").getAttribute("src"), originalArt);
  assert.equal(
    await page.locator("#source-link").getAttribute("href"),
    originalSource,
  );
  assert.equal(await page.locator("#verse").getAttribute("lang"), "zh-TW");
  assert.equal(
    await page.locator("#verse").innerText(),
    toTraditional(originalQuote.lines.join("\n")),
  );
  assert.equal(
    await page.locator("#fulltext").textContent(),
    toTraditional(originalQuote.fullText),
  );
  assert.equal(
    await page.locator("#meaning").textContent(),
    toTraditional(originalQuote.meaning),
  );
  assert.equal(
    await page.locator("#appreciation").textContent(),
    toTraditional(originalQuote.appreciation),
  );
  assert.equal(
    await page.locator("#reading-title").textContent(),
    toTraditional(originalQuote.title),
  );
  assert.equal(await second.locator("#calendar-title").textContent(), "萬年曆");
  assert.match(
    await second.locator("#calendar-selected-lunar").textContent(),
    /農曆/,
  );
  await second.locator("#calendar-month").click();
  await second.locator("#calendar-month-options [data-value='2']").click();
  assert.match(await second.locator("#calendar-terms").textContent(), /驚蟄/);
  assert.equal(
    await second.locator(".has-term .calendar-lunar").first().textContent(),
    "驚蟄",
  );
  assert.match(
    await second.locator(".has-term").first().getAttribute("aria-label"),
    /農曆.*驚蟄/,
  );
  await page.waitForFunction(async () => {
    const settings = globalThis.chrome?.runtime?.id
      ? (await chrome.storage.local.get("settings")).settings
      : JSON.parse(localStorage.getItem("yijian:settings"));
    return settings?.language === "zh-TW";
  });
  assert.deepEqual(
    await page.evaluate(async () =>
      globalThis.chrome?.runtime?.id
        ? (await chrome.storage.local.get("history")).history
        : JSON.parse(localStorage.getItem("yijian:history")),
    ),
    historyBefore,
  );
  await page.screenshot({
    path: root + `artifacts/language-${label}-traditional-settings.png`,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await page.locator("#library-button").click();
  assert.equal(await page.locator("#library-title").textContent(), "收藏冊");
  assert.equal(
    await page.locator(".saved-quote span[lang]").getAttribute("lang"),
    "zh-TW",
  );
  assert.equal(
    await page.locator(".saved-quote strong").textContent(),
    toTraditional(verseBefore.replaceAll("\n", "，")),
  );
  await page.keyboard.press("Escape");
  await page.locator("#read-button").click();
  assert.ok(await page.locator("#reading-dialog").isVisible());
  assert.ok(await page.locator("#reading-dialog").evaluate(
    (dialog) => dialog.scrollWidth <= dialog.clientWidth,
  ));
  await page.screenshot({
    path: root + `artifacts/language-${label}-traditional-reading.png`,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await second.reload();
  await ready(second);
  assert.equal(await second.locator("html").getAttribute("lang"), "zh-TW");
  assert.equal(await second.locator("#verse").getAttribute("lang"), "zh-TW");
  await second.locator("#almanac-button").click();
  await page.locator("#settings-button").click();
  await pickLanguage(page, "zh");
  await second.waitForFunction(() => document.documentElement.lang === "zh-CN");
  assert.equal(
    await page.locator("#verse").innerText(),
    originalQuote.lines.join("\n"),
  );
  await pickLanguage(page, "auto");
  await second.waitForFunction(() => document.documentElement.lang === "en-US");
  await second.close();
  await page.keyboard.press("Escape");
  await page.clock.setFixedTime(new Date("2026-10-08T01:00:00+08:00"));
  await page.clock.runFor(16000);
  assert.equal(await page.locator("#term-label").textContent(), "Cold Dew");
  assert.ok(await page.locator("#term-label").isVisible());
  console.log(
    `PASS ${label}: English and Chinese script switching, poems, readings, favorites, calendar, persistence, keyboard, tab sync and narrow layouts`,
  );
}
try {
  await mkdir(root + "artifacts", { recursive: true });
  browser = await chromium.launchPersistentContext(profile, {
    executablePath,
    headless: true,
    locale: "en-US",
    timezoneId: "Asia/Shanghai",
    viewport: { width: 1440, height: 900 },
    args: [
      `--disable-extensions-except=${root}extension`,
      `--load-extension=${root}extension`,
    ],
  });
  const worker =
    browser.serviceWorkers()[0] ||
    (await browser.waitForEvent("serviceworker"));
  await worker.evaluate(() =>
    chrome.storage.local.set({ settings: { onlineEnabled: false } }),
  );
  await verify(await browser.newPage(), "chrome://newtab/", "extension");
  server = createPreviewServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const previewUrl = `http://127.0.0.1:${server.address().port}/`;
  await verify(await browser.newPage(), previewUrl, "preview");
  const chineseBrowser = await chromium.launch({
    executablePath,
    headless: true,
  });
  try {
    for (const [locale, expected] of [
      ["zh-CN", "zh-CN"],
      ["zh-TW", "zh-TW"],
      ["zh-HK", "zh-TW"],
      ["zh-Hant", "zh-TW"],
    ]) {
      const page = await chineseBrowser.newPage({ locale });
      await page.goto(previewUrl);
      await ready(page);
      assert.equal(await page.locator("html").getAttribute("lang"), expected);
      assert.equal(await page.locator("#verse").getAttribute("lang"), expected);
      await page.close();
    }
  } finally {
    await chineseBrowser.close();
  }
  assert.deepEqual(errors, []);
  console.log("PASS Chinese browser defaults to Chinese; no JavaScript errors");
} finally {
  await browser?.close();
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  await rm(profile, { recursive: true, force: true });
}
