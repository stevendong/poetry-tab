import { chromium } from "playwright";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = await mkdtemp(join(tmpdir(), "yijian-api-settings-"));
const extension = join(directory, "extension");
const manifestPath = join(extension, "manifest.json");
let browser;
const errors = [];

async function launch() {
  browser = await chromium.launchPersistentContext(join(directory, "profile"), {
    executablePath: process.env.CHROME_PATH || chromium.executablePath(),
    headless: true,
    args: [
      `--load-extension=${extension}`,
      `--disable-extensions-except=${extension}`,
    ],
  });
  const worker =
    browser.serviceWorkers()[0] || await browser.waitForEvent("serviceworker");
  await worker.evaluate(() =>
    chrome.storage.local.set({
      settings: { language: "zh", onlineEnabled: false, provider: "jinrishici" },
    }),
  );
  const page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("chrome://newtab/");
  await page.waitForFunction(() =>
    document.getElementById("poetry")?.getAttribute("aria-busy") === "false",
  );
  await page.locator("#settings-button").click();
  return page;
}

async function save(
  page,
  provider = "service",
  url = "https://poetry-api.nabulalogic.com",
) {
  await page.locator("#api-provider").selectOption(provider);
  if (provider !== "jinrishici") await page.locator("#api-url").fill(url);
  await page.locator("#save-api").click();
  await page.waitForFunction(() => !document.getElementById("save-api").disabled);
  return page.locator("#api-status").innerText();
}

async function savedSettings(page) {
  return page.evaluate(
    async () => (await chrome.storage.local.get("settings")).settings,
  );
}

try {
  await cp(fileURLToPath(new URL("../extension", import.meta.url)), extension, {
    recursive: true,
  });
  const manifest = await readFile(manifestPath, "utf8");
  const staleManifest = JSON.parse(manifest);
  delete staleManifest.optional_host_permissions;
  await writeFile(manifestPath, JSON.stringify(staleManifest));
  let page = await launch();
  const before = await savedSettings(page);
  // Simulate pulling new files while Chrome still holds the old manifest.
  await writeFile(manifestPath, manifest);
  await page.reload();
  await page.waitForFunction(() =>
    document.getElementById("poetry")?.getAttribute("aria-busy") === "false",
  );
  await page.locator("#settings-button").click();
  assert.match(await save(page), /chrome:\/\/extensions.*重新加载/);
  assert.deepEqual(await savedSettings(page), before);
  console.log("PASS Real stale-manifest permission failure explains how to reload and preserves settings");
  await browser.close();

  page = await launch();
  const initial = await savedSettings(page);
  await page.evaluate(() => {
    chrome.permissions.request = async () => false;
  });
  assert.match(await save(page), /未获得/);
  assert.deepEqual(await savedSettings(page), initial);

  await page.evaluate(() => {
    chrome.permissions.request = async () => {
      throw new Error("This function must be called during a user gesture");
    };
  });
  assert.match(await save(page), /站点授权未能完成/);
  assert.deepEqual(await savedSettings(page), initial);
  console.log("PASS Denied and rejected authorization have distinct messages and preserve settings");

  await page.evaluate(() => {
    chrome.permissions.request = async () => {
      throw new Error("Invalid URL must not request permissions");
    };
  });
  assert.match(await save(page, "service", "not-a-url"), /有效的 HTTP/);
  assert.deepEqual(await savedSettings(page), initial);

  await page.evaluate(() => {
    chrome.permissions.request = async () => true;
    globalThis.__originalStorageSet = chrome.storage.local.set;
    chrome.storage.local.set = async () => {
      throw new Error("Storage unavailable");
    };
  });
  assert.match(await save(page), /接口未能保存/);
  await page.evaluate(() => {
    chrome.storage.local.set = globalThis.__originalStorageSet;
  });
  // A later ordinary settings change must not persist the failed API config.
  await page.locator("#show-clock").uncheck();
  await page.waitForFunction(async () =>
    (await chrome.storage.local.get("settings")).settings.showClock === false,
  );
  assert.equal((await savedSettings(page)).provider, "jinrishici");
  console.log("PASS Failed storage write does not leak an unsaved API into later settings changes");

  assert.match(await save(page), /接口已保存/);
  assert.equal((await savedSettings(page)).provider, "service");
  await page.reload();
  await page.waitForFunction(() =>
    document.getElementById("poetry")?.getAttribute("aria-busy") === "false",
  );
  await page.locator("#settings-button").click();
  assert.equal(await page.locator("#api-provider").inputValue(), "service");
  await page.evaluate(() => {
    chrome.permissions.request = async () => {
      throw new Error("Default provider must not request permissions");
    };
  });
  assert.match(await save(page, "jinrishici"), /接口已保存/);
  assert.equal((await savedSettings(page)).provider, "jinrishici");
  console.log("PASS Granted API configuration persists across reload; default provider needs no optional grant");
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await rm(directory, { recursive: true, force: true });
}
