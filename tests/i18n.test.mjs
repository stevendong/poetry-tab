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
  lunarAccessible,
  locale,
  chineseLocale,
  chineseText,
  monthLabel,
  yearLabel,
} from "../extension/i18n.js";
import { sanitizeSettings } from "../extension/storage.js";
import { lunarDate } from "../extension/calendar.js";
import { TERMS } from "../extension/context.js";

test("language selection follows the browser and accepts saved overrides", () => {
  assert.equal(resolveLanguage("auto", "en-GB"), "en");
  for (const tag of ["zh-TW", "zh-HK", "zh-MO", "zh-Hant", "zh-Hant-CN"])
    assert.equal(resolveLanguage("auto", tag), "zh-TW", tag);
  for (const tag of ["zh", "zh-CN", "zh-SG", "zh-Hans", "zh-Hans-TW"])
    assert.equal(resolveLanguage("auto", tag), "zh", tag);
  assert.equal(resolveLanguage("auto", "ja-JP"), "en");
  assert.equal(resolveLanguage("zh", "en-US"), "zh");
  assert.equal(resolveLanguage("en", "zh-CN"), "en");
  assert.equal(resolveLanguage("zh-TW", "en-US"), "zh-TW");
  assert.equal(sanitizeSettings({ language: "zh-TW" }).language, "zh-TW");
  assert.equal(sanitizeSettings({ language: "zh" }).language, "zh");
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

test("Traditional Chinese covers messages, poems, phrase ambiguity and lunar labels", () => {
  setLanguage("zh-TW");
  try {
    assert.equal(locale(), "zh-TW");
    assert.equal(chineseLocale(), "zh-TW");
    assert.equal(t("brand"), "一箋");
    assert.equal(t("preferences"), "偏好設置");
    assert.equal(t("favoriteAdded"), "已收入收藏冊");
    assert.equal(t("libraryCount", { count: 3 }), "共 3 箋");
    for (const key of Object.keys(MESSAGES.zh)) {
      assert.ok(t(key).trim(), key);
      assert.notEqual(t(key), key);
    }
    assert.equal(
      chineseText("床前明月光，低头思故乡。"),
      "床前明月光，低頭思故鄉。",
    );
    assert.equal(
      chineseText("春风又绿江南岸，明月何时照我还。"),
      "春風又綠江南岸，明月何時照我還。",
    );
    assert.equal(
      chineseText("皇后在后面，头发随风飘扬。"),
      "皇后在後面，頭髮隨風飄揚。",
    );
    assert.equal(chineseText("Yijian · 2026 ↗\n"), "Yijian · 2026 ↗\n");
    assert.equal(termLabel("惊蛰"), "驚蟄");
    assert.equal(monthLabel(9), "10月");
    assert.equal(yearLabel(2026), "2026年");
    const lunar = lunarDate(new Date(2025, 6, 25, 12));
    assert.match(lunarLabel(lunar), /農曆.*閏六月/);
    assert.match(lunarLabel(lunar, true), /閏六月/);
    assert.match(lunarAccessible(lunar), /農曆閏六月/);
    setLanguage("zh");
    assert.equal(chineseText("頭髮與後面的皇后"), "头发与后面的皇后");
    assert.equal(locale(), "zh-CN");
    setLanguage("en");
    assert.equal(chineseLocale(), "zh-CN");
    assert.equal(chineseText("詩詞"), "诗词");
  } finally {
    setLanguage("zh");
  }
});

test("Display conversion keeps source glyphs instead of introducing rare extension forms", () => {
  try {
    for (const language of ["zh", "en"]) {
      setLanguage(language);
      assert.equal(chineseText("重湖疊巘清嘉，"), "重湖叠巘清嘉，");
      assert.equal(chineseText("趙孟頫的書畫"), "赵孟頫的书画");
      assert.equal(chineseText("𠮷𪩘𠀀🌙 · 2026\n"), "𠮷𪩘𠀀🌙 · 2026\n");
    }
    setLanguage("zh-TW");
    assert.equal(chineseText("重湖叠巘清嘉，"), "重湖疊巘清嘉，");
    assert.equal(chineseText("赵孟頫的书画"), "趙孟頫的書畫");
  } finally {
    setLanguage("zh");
  }
});

test("Chrome extension metadata is translated in all supported locales", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../extension/manifest.json", import.meta.url)),
  );
  assert.equal(manifest.default_locale, "zh_CN");
  for (const locale of ["en", "zh_CN", "zh_TW"]) {
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
