import test from "node:test";
import assert from "node:assert/strict";
import {
  getContext,
  selectQuote,
  scoreQuote,
  TERMS,
} from "../extension/context.js";
import { QUOTES } from "../extension/quotes.js";
import { sanitizeSettings, DEFAULT_SETTINGS } from "../extension/storage.js";
process.env.TZ = "Asia/Shanghai";

test("time boundaries use local timezone, including midnight", () => {
  for (const [hour, period] of [
    [0, "night"],
    [4, "night"],
    [5, "dawn"],
    [8, "dawn"],
    [9, "day"],
    [16, "day"],
    [17, "dusk"],
    [19, "dusk"],
    [20, "night"],
    [23, "night"],
  ]) {
    assert.equal(getContext(new Date(2026, 9, 14, hour)).period, period);
  }
});

test("season derives from solar terms, rather than calendar month", () => {
  for (const [day, season, term] of [
    ["2026-01-15", "winter", "小寒"],
    ["2026-02-15", "spring", "立春"],
    ["2026-04-14", "spring", "清明"],
    ["2026-05-15", "summer", "立夏"],
    ["2026-07-15", "summer", "小暑"],
    ["2026-08-15", "autumn", "立秋"],
    ["2026-10-14", "autumn", "寒露"],
    ["2026-11-15", "winter", "立冬"],
  ]) {
    const actual = getContext(new Date(`${day}T12:00:00+08:00`));
    assert.equal(actual.season, season, day);
    assert.equal(actual.term, term, day);
  }
});

test("solar term boundaries agree with 2026 NAOJ table away from approximate boundary", () => {
  // NAOJ reference is JST. Use 2h either side because our low-order longitude is approximate.
  const crossings = [
    ["2026-02-04T05:02:00+09:00", "大寒", "立春"],
    ["2026-03-20T23:46:00+09:00", "惊蛰", "春分"],
    ["2026-06-21T17:25:00+09:00", "芒种", "夏至"],
    ["2026-10-08T15:29:00+09:00", "秋分", "寒露"],
  ];
  for (const [date, before, after] of crossings) {
    assert.equal(
      getContext(new Date(new Date(date).getTime() - 7200000)).term,
      before,
    );
    assert.equal(
      getContext(new Date(new Date(date).getTime() + 7200000)).term,
      after,
    );
  }
});

test("southern hemisphere reverses seasons and retains Chinese solar term", () => {
  for (const month of [0, 3, 6, 9]) {
    const date = new Date(2026, month, 14, 12);
    const n = getContext(date);
    const s = getContext(date, "south");
    assert.equal(
      s.season,
      {
        spring: "autumn",
        summer: "winter",
        autumn: "spring",
        winter: "summer",
      }[n.season],
    );
    assert.equal(s.term, n.term);
  }
});

test("all 16 season/time contexts have at least two compatible options", () => {
  for (const season of ["spring", "summer", "autumn", "winter"]) {
    for (const period of ["dawn", "day", "dusk", "night"]) {
      const context = { season, period, term: "寒露", hemisphere: "north" };
      const eligible = QUOTES.filter((q) => scoreQuote(q, context) > 0);
      assert.ok(eligible.length >= 2, `${season} ${period}`);
      let history = [];
      let previous;
      for (let i = 0; i < 50; i++) {
        const selected = selectQuote(
          QUOTES,
          context,
          history,
          () => (i % 10) / 10,
          previous,
        );
        assert.notEqual(selected.id, previous);
        assert.ok(eligible.includes(selected));
        history.push(selected.id);
        previous = selected.id;
      }
    }
  }
});

test("use all unvisited compatible quotes before cycling history", () => {
  const context = { season: "summer", period: "day" };
  const count = QUOTES.filter((q) => scoreQuote(q, context) > 0).length;
  const history = [];
  for (let i = 0; i < count; i++) {
    const quote = selectQuote(QUOTES, context, history, () => 0);
    assert.ok(!history.includes(quote.id));
    history.push(quote.id);
  }
  assert.equal(selectQuote(QUOTES, context, history, () => 0).id, history[0]);
});

test("snow metaphor is winter and Red Cliff prose is autumn", () => {
  const snow = QUOTES.find((q) => q.id === "winter-blossom");
  assert.equal(scoreQuote(snow, { season: "spring", period: "day" }), 0);
  assert.ok(scoreQuote(snow, { season: "winter", period: "day" }) > 0);
  assert.deepEqual(QUOTES.find((q) => q.id === "red-cliff").seasons, [
    "autumn",
  ]);
});

test("specific seasonal and solar-term matches get higher weight", () => {
  const context = {
    season: "autumn",
    period: "day",
    term: "寒露",
    hemisphere: "north",
  };
  const fruit = QUOTES.find((q) => q.id === "autumn-fruit");
  const cloud = QUOTES.find((q) => q.id === "clouds");
  assert.ok(scoreQuote(fruit, context) > scoreQuote(cloud, context));
  assert.equal(
    scoreQuote(fruit, context) -
      scoreQuote(fruit, { ...context, hemisphere: "south" }),
    3,
  );
});

test("poem fonts default to local Kai and accept only supported choices", () => {
  assert.equal(DEFAULT_SETTINGS.poemFont, "brush");
  assert.equal(sanitizeSettings({ showClock: false }).poemFont, "brush");
  for (const poemFont of ["brush", "serif", "sans"])
    assert.equal(sanitizeSettings({ poemFont }).poemFont, poemFont);
  for (const poemFont of [null, 3, "unknown", "url(https://example.com/font)"])
    assert.equal(sanitizeSettings({ poemFont }).poemFont, "brush");
});

test("invalid data fails clearly and corrupt settings recover to defaults", () => {
  assert.throws(() => getContext(new Date("bad")), TypeError);
  assert.throws(
    () => selectQuote([], { season: "summer", period: "day" }),
    /No quote/,
  );
  assert.deepEqual(sanitizeSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(sanitizeSettings("bad"), DEFAULT_SETTINGS);
  assert.deepEqual(
    sanitizeSettings({
      hemisphere: "bad",
      showClock: "false",
      textSize: "<script>",
      shade: Infinity,
    }),
    DEFAULT_SETTINGS,
  );
  assert.equal(sanitizeSettings({ shade: 100 }).shade, 70);
  assert.equal(sanitizeSettings({ shade: -1 }).shade, 15);
});

test("collection includes poems, ci, prose; every quotation occurs in its original", () => {
  assert.equal(new Set(QUOTES.map((q) => q.id)).size, QUOTES.length);
  assert.equal(new Set(QUOTES.map((q) => q.art)).size, QUOTES.length);
  assert.ok(QUOTES.some((q) => q.kind === "古文"));
  assert.ok(QUOTES.some((q) => q.kind === "词"));
  for (const quote of QUOTES) {
    for (const line of quote.lines)
      assert.ok(quote.fullText.includes(line), `${quote.id}: ${line}`);
    assert.ok(
      quote.meaning && quote.appreciation && quote.author && quote.title,
    );
    assert.ok(quote.terms?.every((term) => TERMS.includes(term)) ?? true);
    assert.equal(new URL(quote.source).hostname, "zh.wikisource.org");
  }
});
