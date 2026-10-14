import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPreviewServer } from "../scripts/preview.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const profile = await mkdtemp(join(tmpdir(), "yijian-calendar-"));
const executablePath = process.env.CHROME_PATH || chromium.executablePath();
const errors = [];
let browser;
let server;

async function pick(page, id, value) {
  await page.locator(`#${id}`).click();
  await page.locator(`#${id}-options [data-value='${value}']`).click();
  assert.equal(
    await page.locator(`#${id}`).getAttribute("aria-expanded"),
    "false",
  );
}

async function verifyCalendar(page, url, label) {
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date("2026-10-14T12:00:00+08:00"));
  await page.goto(url);
  await page.waitForSelector("#art.loaded");
  assert.equal(await page.locator("#term-label").isVisible(), false);
  assert.equal(await page.locator("#term-dot").isVisible(), false);
  await page.getByRole("button", { name: "打开万年历" }).click();
  assert.ok(await page.locator("#calendar-dialog").isVisible());
  assert.equal(await page.locator(".calendar-day").count(), 42);
  assert.equal(
    await page
      .locator(".calendar-day[aria-current='date']")
      .getAttribute("data-date"),
    "2026-10-14",
  );
  assert.ok(
    (await page.locator("#calendar-selected-lunar").textContent()).includes(
      "九月初五",
    ),
  );
  assert.equal(
    await page.locator("#calendar-selected-term").isVisible(),
    false,
  );
  assert.equal(
    await page.locator("#calendar-terms").textContent(),
    "本月节气：寒露 8日 · 霜降 23日",
  );
  assert.equal(await page.locator("#calendar-dialog select").count(), 0);
  await page.locator("#calendar-year").focus();
  await page.keyboard.press("ArrowDown");
  assert.equal(
    await page.locator("#calendar-year").getAttribute("aria-expanded"),
    "true",
  );
  assert.ok(await page.locator("#calendar-year-options").isVisible());
  assert.equal(
    await page
      .locator("#calendar-year-options [aria-selected='true']")
      .getAttribute("data-value"),
    "2026",
  );
  await page.screenshot({
    path: root + `artifacts/calendar-${label}-year-picker.png`,
  });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  assert.ok(await page.locator("#calendar-dialog").isVisible());
  assert.equal(
    await page.locator("#calendar-year").getAttribute("value"),
    "2026",
  );
  await page.keyboard.type("2024");
  await page.keyboard.press("Enter");
  assert.equal(
    await page.locator("#calendar-year").getAttribute("value"),
    "2024",
  );
  await pick(page, "calendar-year", "2026");
  await page.locator("#calendar-month").click();
  await page.screenshot({
    path: root + `artifacts/calendar-${label}-month-picker.png`,
  });
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  assert.equal(
    await page.locator("#calendar-month").getAttribute("value"),
    "11",
  );
  await pick(page, "calendar-month", "9");
  await page.locator("#calendar-year").click();
  await page.locator("#calendar-month").click();
  assert.equal(await page.locator("#calendar-year-options").isVisible(), false);
  await page.keyboard.press("Tab");
  assert.equal(
    await page.locator("#calendar-month-options").isVisible(),
    false,
  );
  await page.locator("[data-date='2026-10-08']").click();
  assert.equal(
    await page.locator("#calendar-selected-term").textContent(),
    "寒露",
  );
  assert.equal(await page.locator("#calendar-today-label").isVisible(), false);
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await page.locator("#calendar-selected-term").isVisible(),
    false,
  );
  assert.equal(
    await page.locator(".calendar-day:focus").getAttribute("data-date"),
    "2026-10-09",
  );
  await page.keyboard.press("PageUp");
  assert.equal(
    await page.locator("#calendar-month").getAttribute("value"),
    "8",
  );
  await page.keyboard.press("End");
  assert.equal(
    await page.locator(".calendar-day:focus").getAttribute("data-date"),
    "2026-09-13",
  );
  await pick(page, "calendar-month", "11");
  await page.locator("#calendar-next").click();
  assert.equal(
    await page.locator("#calendar-year").getAttribute("value"),
    "2027",
  );
  assert.equal(
    await page.locator("#calendar-month").getAttribute("value"),
    "0",
  );
  await pick(page, "calendar-year", "2025");
  await pick(page, "calendar-month", "6");
  await page.locator("[data-date='2025-07-25']").click();
  assert.ok(
    (await page.locator("#calendar-selected-lunar").textContent()).includes(
      "闰六月初一",
    ),
  );
  await pick(page, "calendar-year", "2024");
  await pick(page, "calendar-month", "1");
  assert.equal(await page.locator("[data-date='2024-02-29']").count(), 1);
  await pick(page, "calendar-year", "1900");
  await pick(page, "calendar-month", "0");
  assert.ok(await page.locator("#calendar-prev").isDisabled());
  await page.locator("[data-date='1900-01-01']").click();
  await page.keyboard.press("ArrowLeft");
  assert.equal(
    await page.locator(".calendar-day:focus").getAttribute("data-date"),
    "1900-01-01",
  );
  await pick(page, "calendar-year", "2100");
  await pick(page, "calendar-month", "11");
  assert.ok(await page.locator("#calendar-next").isDisabled());
  assert.ok(await page.locator("[data-date='2101-01-01']").isDisabled());
  await page.locator("#calendar-today").click();
  assert.equal(
    await page.locator(".calendar-day:focus").getAttribute("data-date"),
    "2026-10-14",
  );
  // Periodic clock updates must preserve the focused date button.
  await page.clock.runFor(16000);
  assert.equal(
    await page.locator(".calendar-day:focus").getAttribute("data-date"),
    "2026-10-14",
  );
  await page.screenshot({
    path: root + `artifacts/calendar-${label}-desktop.png`,
  });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page
        .locator("#calendar-dialog")
        .evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth),
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.locator("#calendar-year").click();
    assert.ok(
      await page.locator("#calendar-year-options").evaluate((menu) => {
        const rect = menu.getBoundingClientRect();
        return (
          rect.left >= 0 &&
          rect.right <= innerWidth &&
          rect.top >= 0 &&
          rect.bottom <= innerHeight
        );
      }),
    );
    await page.locator("#calendar-year-options [data-value='2026']").click();
    await page.locator("#calendar-month").click();
    await page.locator("#calendar-month-options [data-value='9']").click();
    await page.locator("[data-date='2026-10-23']").click();
    assert.equal(
      await page.locator("#calendar-selected-term").textContent(),
      "霜降",
    );
    await page.screenshot({
      path: root + `artifacts/calendar-${label}-${width}.png`,
    });
  }
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#calendar-dialog").isVisible(), false);
  assert.ok(
    await page
      .locator("#almanac-button")
      .evaluate((button) => button === document.activeElement),
  );
  await page.keyboard.press("Enter");
  assert.ok(await page.locator("#calendar-dialog").isVisible());
  await page.getByRole("button", { name: "关闭万年历" }).click();
  await page.clock.setFixedTime(new Date("2026-10-08T01:00:00+08:00"));
  await page.reload();
  await page.waitForSelector("#art.loaded");
  assert.ok(await page.locator("#term-label").isVisible());
  assert.equal(await page.locator("#term-label").textContent(), "寒露");
  assert.ok(await page.locator("#term-dot").isVisible());
  // The open calendar also refreshes today's marker when local midnight passes.
  await page.locator("#almanac-button").click();
  await page.clock.setFixedTime(new Date("2026-10-09T00:01:00+08:00"));
  await page.clock.runFor(16000);
  assert.equal(await page.locator("#term-label").isVisible(), false);
  assert.equal(
    await page
      .locator(".calendar-day[aria-current='date']")
      .getAttribute("data-date"),
    "2026-10-09",
  );
  assert.equal(await page.locator("#calendar-today-label").isVisible(), false);
  console.log(
    `PASS ${label}: term-day header, lunar/leap months, year limits, navigation, keyboard, midnight refresh, 320px/390px layouts`,
  );
}

try {
  await mkdir(root + "artifacts", { recursive: true });
  browser = await chromium.launchPersistentContext(profile, {
    executablePath,
    headless: true,
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
  const page = await browser.newPage();
  await verifyCalendar(page, "chrome://newtab/", "extension");
  await page.close();
  server = createPreviewServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const preview = await browser.newPage();
  await verifyCalendar(
    preview,
    `http://127.0.0.1:${server.address().port}/`,
    "preview",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS calendar produces no JavaScript errors in extension and preview",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  await rm(profile, { recursive: true, force: true });
}
