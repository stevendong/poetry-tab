export const SEASONS = {
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬",
};
export const PERIODS = {
  dawn: "清晨",
  day: "日间",
  dusk: "黄昏",
  night: "夜晚",
};
export const TERMS = [
  "立春",
  "雨水",
  "惊蛰",
  "春分",
  "清明",
  "谷雨",
  "立夏",
  "小满",
  "芒种",
  "夏至",
  "小暑",
  "大暑",
  "立秋",
  "处暑",
  "白露",
  "秋分",
  "寒露",
  "霜降",
  "立冬",
  "小雪",
  "大雪",
  "冬至",
  "小寒",
  "大寒",
];
const radians = Math.PI / 180;
const normalized = (n) => ((n % 360) + 360) % 360;

// Low-order apparent solar longitude. Suitable for contextual recommendations,
// not an almanac for minute-precise solar-term boundary times.
export function solarLongitude(date) {
  const t = (date.getTime() / 86400000 + 2440587.5 - 2451545) / 36525;
  const l = normalized(280.46646 + t * (36000.76983 + 0.0003032 * t));
  const m = normalized(357.52911 + t * (35999.05029 - 0.0001537 * t)) * radians;
  const c =
    (1.914602 - t * (0.004817 + 0.000014 * t)) * Math.sin(m) +
    (0.019993 - 0.000101 * t) * Math.sin(2 * m) +
    0.000289 * Math.sin(3 * m);
  return normalized(
    l + c - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * t) * radians),
  );
}

export function getContext(date = new Date(), hemisphere = "north") {
  if (!Number.isFinite(date.getTime())) throw new TypeError("Invalid date");
  const termIndex = Math.floor(normalized(solarLongitude(date) - 315) / 15);
  const northSeason = ["spring", "summer", "autumn", "winter"][
    Math.floor(termIndex / 6)
  ];
  const season =
    hemisphere === "south"
      ? {
          spring: "autumn",
          summer: "winter",
          autumn: "spring",
          winter: "summer",
        }[northSeason]
      : northSeason;
  const hour = date.getHours();
  const period =
    hour >= 5 && hour < 9
      ? "dawn"
      : hour >= 9 && hour < 17
        ? "day"
        : hour >= 17 && hour < 20
          ? "dusk"
          : "night";
  return { season, period, term: TERMS[termIndex], termIndex, hemisphere };
}

export function scoreQuote(quote, context) {
  // Prefer an appropriate season, then the time of day. General scenes fill gaps.
  if (!quote.seasons.includes(context.season) && !quote.seasons.includes("any"))
    return 0;
  if (!quote.periods.includes(context.period) && !quote.periods.includes("any"))
    return 0;
  let score = quote.seasons.includes(context.season) ? 8 : 2;
  score += quote.periods.includes(context.period) ? 4 : 1;
  if (context.hemisphere !== "south" && quote.terms?.includes(context.term))
    score += 3;
  return score;
}

export function selectQuote(
  quotes,
  context,
  history = [],
  random = Math.random,
  currentId = null,
) {
  const eligible = quotes.filter((q) => scoreQuote(q, context) > 0);
  if (!eligible.length) throw new Error("No quote for this context");
  // Remove the displayed quote whenever alternatives exist; relax history oldest first.
  const alternatives = eligible.filter((q) => q.id !== currentId);
  const base = alternatives.length ? alternatives : eligible;
  const recent = history.slice(-6);
  let candidates = base.filter((q) => !recent.includes(q.id));
  if (!candidates.length) {
    const oldest = Math.min(...base.map((q) => recent.lastIndexOf(q.id)));
    candidates = base.filter((q) => recent.lastIndexOf(q.id) === oldest);
  }
  const total = candidates.reduce((sum, q) => sum + scoreQuote(q, context), 0);
  let point = Math.min(0.999999999, Math.max(0, random())) * total;
  return (
    candidates.find((q) => (point -= scoreQuote(q, context)) < 0) ??
    candidates.at(-1)
  );
}

export function matchingReason(quote, context) {
  const season = quote.seasons.includes(context.season)
    ? `${SEASONS[context.season]}日`
    : "此刻";
  return `${season} · ${PERIODS[context.period]}`;
}
