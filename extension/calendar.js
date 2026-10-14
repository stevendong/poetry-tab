import { getContext } from "./context.js";

export const MIN_YEAR = 1900;
export const MAX_YEAR = 2100;
const lunarFormatter = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
  year: "numeric",
  month: "long",
  day: "numeric",
});
const numerals = "一二三四五六七八九十";
const animals = [..."鼠牛虎兔龙蛇马羊猴鸡狗猪"];

export function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function lunarDate(date) {
  const parts = Object.fromEntries(
    lunarFormatter.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  const day = Number(parts.day);
  const dayName =
    day <= 10
      ? `初${numerals[day - 1]}`
      : day < 20
        ? `十${numerals[day - 11]}`
        : day === 20
          ? "二十"
          : day < 30
            ? `廿${numerals[day - 21]}`
            : "三十";
  return {
    month: parts.month,
    day,
    dayName,
    yearName: parts.yearName,
    animal: animals[(((Number(parts.relatedYear) - 4) % 12) + 12) % 12],
    label: day === 1 ? parts.month : dayName,
  };
}

// A term is shown throughout its crossing day, even before the crossing time.
// Calendar dates follow the same local timezone as the header and clock.
export function solarTermOnDate(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const start = getContext(new Date(year, month, day));
  const end = getContext(
    new Date(new Date(year, month, day + 1).getTime() - 1),
  );
  return start.termIndex === end.termIndex ? "" : end.term;
}

export function shiftMonth(date, offset) {
  const first = new Date(date.getFullYear(), date.getMonth() + offset, 1, 12);
  const lastDay = new Date(
    first.getFullYear(),
    first.getMonth() + 1,
    0,
  ).getDate();
  first.setDate(Math.min(date.getDate(), lastDay));
  return first;
}

export function monthDates(year, month) {
  const first = new Date(year, month, 1, 12);
  const offset = (first.getDay() + 6) % 7;
  return Array.from(
    { length: 42 },
    (_, i) => new Date(year, month, 1 - offset + i, 12),
  );
}
