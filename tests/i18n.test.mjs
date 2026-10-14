import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  MESSAGES,
  resolveLanguage,
  setLanguage,
  getLanguage,
  t,
  termLabel,
  lunarLabel,
} from "../extension/i18n.js";
import { sanitizeSettings } from "../extension/storage.js";
import { lunarDate } from "../extension/calendar.js";
import { TERMS } from "../extension/context.js";

test("language selection follows the browser and accepts saved overrides", () => {
  assert.equal(resolveLanguage("auto", "en-GB"), "en");
  assert.equal(resolveLanguage("auto", "zh-TW"), "zh");
  assert.equal(resolveLanguage("auto", "ja-JP"), "en");
  assert.equal(resolveLanguage("zh", "en-US"), "zh");
  assert.equal(resolveLanguage("en", "zh-CN"), "en");
  assert.equal(sanitizeSettings({ language: "en" }).language, "en");
  assert.equal(sanitizeSettings({ language: "invalid" }).language, "auto");
  assert.equal(sanitizeSettings({}).language, "auto");
});

test("English and Chinese have complete, nonempty interface messages", async () => {
  assert.deepEqual(
    Object.keys(MESSAGES.en).sort(),
    Object.keys(MESSAGES.zh).sort(),
  );
  for (const language of ["zh", "en"]) {
    for (const [key, value] of Object.entries(MESSAGES[language])) {
      assert.equal(typeof value, "string", `${language}.${key}`);
      assert.ok(value.trim(), `${language}.${key}`);
    }
  }
  const html = await readFile(
    new URL("../extension/newtab.html", import.meta.url),
    "utf8",
  );
  for (const [, key] of html.matchAll(
    /data-i18n(?:-title|-aria-label)?="([^"]+)"/g,
  )) {
    assert.ok(MESSAGES.zh[key] && MESSAGES.en[key], key);
  }
});

test("English solar terms and leap lunar months are readable without Chinese labels", () => {
  setLanguage("en");
  try {
    assert.equal(getLanguage(), "en");
    assert.equal(termLabel("寒露"), "Cold Dew");
    for (const term of TERMS)
      assert.ok(!/\p{Script=Han}/u.test(termLabel(term)), term);
    assert.equal(termLabel(""), "");
    const lunar = lunarDate(new Date(2025, 6, 25, 12));
    assert.equal(lunar.monthNumber, 6);
    assert.equal(lunar.isLeap, true);
    assert.match(lunarLabel(lunar), /Year of the Snake.*Leap month 6, day 1/);
    assert.equal(lunarLabel(lunar, true), "L6");
    assert.equal(t("libraryCount", { count: 1, noun: "poem" }), "1 saved poem");
  } finally {
    setLanguage("zh");
  }
  assert.equal(termLabel("寒露"), "寒露");
  assert.equal(t("favoriteAdded"), "已收入收藏册");
});

test("Chrome extension metadata is translated in both locales", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../extension/manifest.json", import.meta.url)),
  );
  assert.equal(manifest.default_locale, "zh_CN");
  for (const locale of ["en", "zh_CN"]) {
    const messages = JSON.parse(
      await readFile(
        new URL(
          `../extension/_locales/${locale}/messages.json`,
          import.meta.url,
        ),
      ),
    );
    for (const field of ["name", "description"]) {
      const key = manifest[field].match(/^__MSG_(.+)__$/)[1];
      assert.ok(messages[key].message.trim());
    }
    assert.ok(messages.extensionDescription.message.length <= 132);
  }
});
