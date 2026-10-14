import test from "node:test";
import assert from "node:assert/strict";
import {
  dateKey,
  lunarDate,
  solarTermOnDate,
  shiftMonth,
  monthDates,
} from "../extension/calendar.js";
import { TERMS } from "../extension/context.js";

process.env.TZ = "Asia/Shanghai";
const date = (year, month, day, hour = 12) =>
  new Date(year, month - 1, day, hour);

test("header term appears only on the crossing day, including before the crossing", () => {
  assert.equal(solarTermOnDate(date(2026, 10, 7)), "");
  assert.equal(solarTermOnDate(date(2026, 10, 8, 0)), "寒露");
  assert.equal(solarTermOnDate(date(2026, 10, 8, 23)), "寒露");
  assert.equal(solarTermOnDate(date(2026, 10, 9)), "");
  assert.equal(solarTermOnDate(date(2026, 10, 14)), "");
  assert.equal(solarTermOnDate(date(2026, 10, 23)), "霜降");
  assert.equal(solarTermOnDate(date(2026, 10, 24)), "");
});

test("all 24 terms appear once in 2026 and cover the winter-to-spring wrap", () => {
  const terms = [];
  for (let i = 0; i < 365; i++) {
    const term = solarTermOnDate(new Date(2026, 0, 1 + i, 12));
    if (term) terms.push(term);
  }
  assert.equal(terms.length, 24);
  assert.deepEqual(new Set(terms), new Set(TERMS));
  assert.equal(solarTermOnDate(date(2026, 1, 20)), "大寒");
  assert.equal(solarTermOnDate(date(2026, 2, 4)), "立春");
});

test("term dates follow the local timezone, including a crossing near midnight", () => {
  const previousTimezone = process.env.TZ;
  try {
    process.env.TZ = "America/Los_Angeles";
    assert.equal(solarTermOnDate(date(2026, 10, 7)), "寒露");
    assert.equal(solarTermOnDate(date(2026, 10, 8)), "");
  } finally {
    process.env.TZ = previousTimezone;
  }
});

test("lunar New Year and leap month match Hong Kong Observatory date tables", () => {
  // https://www.hko.gov.hk/tc/gts/time/calendar/pdf/files/2026.pdf
  // https://www.hko.gov.hk/tc/gts/time/calendar/pdf/files/2025.pdf
  const eve = lunarDate(date(2026, 2, 16));
  assert.equal(eve.yearName, "乙巳");
  assert.equal(eve.animal, "蛇");
  assert.equal(eve.dayName, "廿九");
  const newYear = lunarDate(date(2026, 2, 17));
  assert.equal(newYear.month, "正月");
  assert.equal(newYear.dayName, "初一");
  assert.equal(newYear.yearName, "丙午");
  assert.equal(newYear.animal, "马");
  assert.equal(lunarDate(date(2025, 7, 24)).dayName, "三十");
  const leap = lunarDate(date(2025, 7, 25));
  assert.equal(leap.month, "闰六月");
  assert.equal(leap.dayName, "初一");
  assert.equal(leap.label, "闰六月");
  assert.equal(lunarDate(date(2026, 10, 14)).dayName, "初五");
});

test("month navigation clamps dates at month ends and crosses years", () => {
  assert.equal(dateKey(shiftMonth(date(2026, 1, 31), 1)), "2026-02-28");
  assert.equal(dateKey(shiftMonth(date(2024, 1, 31), 1)), "2024-02-29");
  assert.equal(dateKey(shiftMonth(date(2026, 12, 31), 1)), "2027-01-31");
  assert.equal(dateKey(shiftMonth(date(2026, 1, 31), -1)), "2025-12-31");
});

test("month grid starts on Monday, includes leap day and adjacent dates", () => {
  const dates = monthDates(2024, 1);
  assert.equal(dates.length, 42);
  assert.equal(dates[0].getDay(), 1);
  assert.equal(dates.filter((date) => date.getMonth() === 1).length, 29);
  assert.ok(dates.some((date) => dateKey(date) === "2024-02-29"));
  assert.equal(dateKey(dates[0]), "2024-01-29");
  assert.equal(dateKey(dates.at(-1)), "2024-03-10");
});
