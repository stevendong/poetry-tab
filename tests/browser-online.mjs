import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { QUOTES } from "../extension/quotes.js";
import { normalizeOnline } from "../extension/online.js";

const root = new URL("../", import.meta.url).pathname;
const profile = await mkdtemp("/tmp/yijian-online-");
const extension = process.env.EXTENSION_PATH || root + "extension";
const executablePath =
  process.env.CHROME_PATH ||
  "/home/ubuntu/.cache/puppeteer/chrome/linux-153.0.8010.12/chrome-linux64/chrome";
let browser;
const results = [],
  errors = [];
const pass = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const fixture = {
  status: "success",
  token: "test-client-marker",
  data: {
    id: "test-autumn",
    content: "洛阳城里见秋风，欲作家书意万重。",
    origin: {
      title: "秋思",
      author: "张籍",
      dynasty: "唐代",
      content: [
        "洛阳城里见秋风，欲作家书意万重。",
        "复恐匆匆说不尽，行人临发又开封。",
      ],
      translate: [
        "一年一度的秋风，又吹到了洛阳城中。想写封家书，心中有许多话要说。",
      ],
    },
    matchTags: ["秋"],
    recommendedReason: "",
  },
};
async function ready(page) {
  await page.waitForFunction(
    () =>
      document.getElementById("poetry").getAttribute("aria-busy") === "false",
    null,
    { timeout: 15000 },
  );
  await page.waitForFunction(() => {
    const art = document.getElementById("art");
    return (
      document.body.dataset.quote &&
      (document.body.dataset.background === "default"
        ? art.hidden && !art.hasAttribute("src")
        : art.classList.contains("loaded") && !art.hidden)
    );
  });
}
async function assertDefaultBackground(page) {
  assert.equal(await page.locator("#art").getAttribute("src"), null);
  assert.ok(await page.locator("#art").isHidden());
  assert.equal(
    await page
      .locator("#art")
      .evaluate((image) => image.classList.contains("loaded")),
    false,
  );
  assert.equal(
    await page.locator("body").getAttribute("data-background"),
    "default",
  );
}
async function reset(worker, payload = fixture, mode = "ok") {
  await worker.evaluate(
    async ({ payload, mode }) => {
      await chrome.storage.local.remove(["onlineState", "history"]);
      globalThis.__testCalls = 0;
      globalThis.fetch = async (_url, { signal } = {}) => {
        globalThis.__testCalls++;
        if (mode === "timeout")
          return new Promise((_, reject) =>
            signal.addEventListener(
              "abort",
              () => reject(new Error("timeout")),
              { once: true },
            ),
          );
        if (mode === "network") throw new Error("network failed");
        if (mode === "http") return new Response("", { status: 503 });
        if (mode === "json") return new Response("{invalid");
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };
    },
    { payload, mode },
  );
}
try {
  browser = await chromium.launchPersistentContext(profile, {
    executablePath,
    headless: true,
    viewport: { width: 1440, height: 900 },
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--renderer-process-limit=3",
      `--load-extension=${extension}`,
      `--disable-extensions-except=${extension}`,
    ],
  });
  const worker =
    browser.serviceWorkers()[0] ||
    (await browser.waitForEvent("serviceworker"));
  await worker.evaluate(() =>
    chrome.storage.local.set({ settings: { language: "zh" } }),
  );
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await mkdir(root + "artifacts", { recursive: true });
  if (process.env.LIVE_API === "1") {
    await page.goto("chrome://newtab/");
    await ready(page);
    assert.ok(
      (await page.getAttribute("body", "data-quote")).startsWith("online:"),
    );
    assert.match(
      await page.locator("#content-source").textContent(),
      /今日诗词/,
    );
    const live = await worker.evaluate(async () => {
      const { onlineState, onlineToken } = await chrome.storage.local.get([
        "onlineState",
        "onlineToken",
      ]);
      globalThis.__firstToken = onlineToken;
      return {
        quoteId: onlineState.quote.id,
        title: onlineState.quote.title,
        author: onlineState.quote.author,
        hasTranslation: Boolean(onlineState.quote.meaning),
        tokenPresent: Boolean(onlineToken),
      };
    });
    assert.ok(live.tokenPresent);
    console.log("LIVE " + JSON.stringify(live));
    await page.screenshot({ path: root + "artifacts/online-live.png" });
    await worker.evaluate(async () =>
      chrome.storage.local.remove("onlineState"),
    );
    await page.reload();
    await ready(page);
    assert.ok(
      (await page.getAttribute("body", "data-quote")).startsWith("online:"),
    );
    assert.ok(
      await worker.evaluate(
        async () =>
          globalThis.__firstToken ===
          (await chrome.storage.local.get("onlineToken")).onlineToken,
      ),
    );
    pass(
      "Real API works from installed Chrome extension; anonymous marker is reused across reload",
    );
  }
  await reset(worker);
  await page.goto("chrome://newtab/");
  await ready(page);
  assert.equal(
    await page.getAttribute("body", "data-quote"),
    "online:test-autumn",
  );
  assert.equal(
    await page.locator("#verse").innerText(),
    "洛阳城里见秋风\n欲作家书意万重",
  );
  await assertDefaultBackground(page);
  await page.evaluate(() => document.fonts.ready);
  await page
    .locator("#poetry")
    .evaluate((element) =>
      Promise.all(
        element.getAnimations().map((animation) => animation.finished),
      ),
    );
  await page.screenshot({
    path: root + "artifacts/online-default-background.png",
  });
  pass(
    "Online recommendation without dedicated artwork uses the default background",
  );
  await page.locator("#read-button").click();
  assert.equal(
    await page.locator("#meaning-heading").textContent(),
    "作品译文",
  );
  assert.equal(
    await page.locator("#meaning").textContent(),
    fixture.data.origin.translate[0],
  );
  assert.equal(
    await page.locator("#fulltext").textContent(),
    fixture.data.origin.content.join("\n"),
  );
  assert.ok(await page.locator("#appreciation-section").isHidden());
  assert.equal(await page.locator("#art-caption").textContent(), "默认背景");
  await page.screenshot({ path: root + "artifacts/online-reading.png" });
  await page.keyboard.press("Escape");
  pass(
    "Online original, provider translation and default background are clearly displayed",
  );
  await page.locator("#favorite-button").click();
  await page.waitForFunction(
    () =>
      document
        .getElementById("favorite-button")
        .getAttribute("aria-pressed") === "true",
  );
  const saved = await worker.evaluate(async () => {
    const r = await chrome.storage.local.get([
      "favorites",
      "favoriteSnapshots",
    ]);
    return {
      ids: r.favorites,
      content: r.favoriteSnapshots["online:test-autumn"].content,
    };
  });
  assert.deepEqual(saved.ids, ["online:test-autumn"]);
  assert.equal(saved.content, fixture.data.content);
  await page.locator("#next-button").click();
  await ready(page);
  assert.ok(
    !(await page.getAttribute("body", "data-quote")).startsWith("online:"),
  );
  assert.match(await page.locator("#content-source").textContent(), /暂未更新/);
  assert.equal(await worker.evaluate(() => globalThis.__testCalls), 1);
  pass(
    "Repeated online content uses offline selection without an extra request",
  );
  await reset(worker, fixture, "network");
  await page.reload();
  await ready(page);
  assert.match(
    await page.locator("#content-source").textContent(),
    /网络暂不可用/,
  );
  await page.locator("#library-button").click();
  await page.locator(".saved-quote").click();
  await page.waitForFunction(
    () => document.body.dataset.quote === "online:test-autumn",
  );
  assert.equal(
    await page.getAttribute("body", "data-quote"),
    "online:test-autumn",
  );
  await page.locator("#read-button").click();
  assert.equal(
    await page.locator("#fulltext").textContent(),
    fixture.data.origin.content.join("\n"),
  );
  await page.keyboard.press("Escape");
  pass(
    "API outage falls back offline while saved online poems remain readable",
  );
  await page.locator("#favorite-button").click();
  await page.waitForFunction(
    () =>
      document
        .getElementById("favorite-button")
        .getAttribute("aria-pressed") === "false",
  );
  assert.ok(
    await worker.evaluate(
      async () =>
        !(await chrome.storage.local.get("favoriteSnapshots"))
          .favoriteSnapshots["online:test-autumn"],
    ),
  );
  pass("Removing an online favorite also removes its stored snapshot");
  for (const mode of ["http", "json", "timeout"]) {
    await reset(worker, fixture, mode);
    const start = Date.now();
    await page.reload();
    await ready(page);
    assert.ok(
      !(await page.getAttribute("body", "data-quote")).startsWith("online:"),
    );
    assert.match(
      await page.locator("#content-source").textContent(),
      /网络暂不可用/,
    );
    assert.ok(Date.now() - start < 8000);
    await page.locator("#next-button").click();
    await ready(page);
    assert.equal(await worker.evaluate(() => globalThis.__testCalls), 1);
    pass(`${mode} failure falls back without hanging or repeatedly retrying`);
  }
  const noTranslation = structuredClone(fixture);
  noTranslation.data.origin.translate = null;
  await reset(worker, noTranslation);
  await page.reload();
  await ready(page);
  await page.locator("#read-button").click();
  assert.match(await page.locator("#meaning").textContent(), /暂未提供/);
  await page.keyboard.press("Escape");
  pass("Absent translations produce an honest empty-state message");
  const local = QUOTES.find((q) => q.id === "winter-river");
  const known = structuredClone(fixture);
  known.data = {
    id: "test-known",
    content: local.lines.join("，") + "。",
    origin: {
      title: local.title,
      author: local.author,
      dynasty: local.dynasty,
      content: local.fullText.split("\n"),
      translate: null,
    },
    matchTags: ["雪"],
  };
  await reset(worker, known);
  await page.reload();
  await ready(page);
  assert.equal(
    await page.locator("#art").getAttribute("src"),
    "assets/art/winter-river.webp",
  );
  await page.locator("#read-button").click();
  assert.equal(await page.locator("#meaning").textContent(), local.meaning);
  assert.match(await page.locator("#art-caption").textContent(), /该句/);
  await page.keyboard.press("Escape");
  pass("Exact local match reuses its dedicated art and explanation");
  // Existing favorites must stop displaying their former borrowed image.
  await worker.evaluate(async (quote) => {
    quote.art = "homesick-moon";
    quote.artExact = true;
    await chrome.storage.local.set({
      favorites: [quote.id],
      favoriteSnapshots: { [quote.id]: quote },
    });
  }, normalizeOnline(fixture));
  await page.locator("#library-button").click();
  await page.locator(".saved-quote").filter({ hasText: "洛阳城里" }).click();
  await assertDefaultBackground(page);
  await reset(worker, known);
  await page.locator("#next-button").click();
  await ready(page);
  assert.equal(
    await page.locator("#art").getAttribute("src"),
    "assets/art/winter-river.webp",
  );
  assert.ok(await page.locator("#art").isVisible());
  pass(
    "Legacy favorite removes the previous image; returning to an illustrated poem restores its image",
  );
  await page.locator("#settings-button").click();
  await page.locator("#online-enabled").uncheck();
  await page.keyboard.press("Escape");
  await ready(page);
  assert.ok(
    !(await page.getAttribute("body", "data-quote")).startsWith("online:"),
  );
  const calls = await worker.evaluate(() => globalThis.__testCalls);
  await page.reload();
  await ready(page);
  assert.equal(await worker.evaluate(() => globalThis.__testCalls), calls);
  pass("Online toggle persists and prevents further requests");
  await page.locator("#settings-button").click();
  await reset(worker);
  await page.locator("#online-enabled").check();
  await page.keyboard.press("Escape");
  await ready(page);
  assert.equal(
    await page.getAttribute("body", "data-quote"),
    "online:test-autumn",
  );
  pass("Re-enabling online recommendations applies immediately");
  // With a delayed response, interaction with the startup offline poem must keep it stable.
  await worker.evaluate(async (payload) => {
    await chrome.storage.local.remove(["onlineState", "history"]);
    globalThis.fetch = async () => {
      await new Promise((r) => setTimeout(r, 1000));
      return new Response(JSON.stringify(payload));
    };
  }, fixture);
  await page.reload();
  await page.waitForSelector("#art.loaded");
  const initial = await page.locator("#verse").innerText();
  await page.locator("#read-button").click();
  await ready(page);
  assert.equal(await page.locator("#verse").innerText(), initial);
  assert.ok(await page.locator("#reading-dialog").evaluate((d) => d.open));
  await page.keyboard.press("Escape");
  pass("Late online results do not replace a poem that the user is reading");
  // Preserve and migrate existing offline favorites alongside new online favorites.
  await worker.evaluate(async () =>
    chrome.storage.local.set({
      favorites: ["spring-dawn"],
      favoriteSnapshots: {},
    }),
  );
  await reset(worker);
  await page.reload();
  await ready(page);
  await page.locator("#favorite-button").click();
  await page.waitForFunction(
    () =>
      document
        .getElementById("favorite-button")
        .getAttribute("aria-pressed") === "true",
  );
  const ids = await worker.evaluate(
    async () => (await chrome.storage.local.get("favorites")).favorites,
  );
  assert.deepEqual(ids, ["spring-dawn", "online:test-autumn"]);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: root + "artifacts/online-mobile.png" });
  pass("Offline favorites migrate intact; online layout fits a 390px window");
  await browser.close();
  browser = null;
  browser = await chromium.launchPersistentContext(profile, {
    executablePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--renderer-process-limit=2",
      `--load-extension=${extension}`,
      `--disable-extensions-except=${extension}`,
    ],
  });
  await browser.setOffline(true);
  const restart = await browser.newPage();
  await restart.goto("chrome://newtab/");
  await ready(restart);
  await restart.locator("#library-button").click();
  assert.equal(await restart.locator(".saved-quote").count(), 2);
  await restart.locator(".saved-quote").filter({ hasText: "洛阳城里" }).click();
  assert.equal(
    await restart.locator("#verse").innerText(),
    "洛阳城里见秋风\n欲作家书意万重",
  );
  await assertDefaultBackground(restart);
  pass(
    "Online favorite survives browser restart and true offline mode with the default background",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    root + "artifacts/online-browser-results.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: await restart.evaluate(() => navigator.userAgent),
        liveAPI: process.env.LIVE_API === "1",
        results,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  await rm(profile, { recursive: true, force: true });
}
