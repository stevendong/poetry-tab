import { QUOTES } from "./quotes.js";

export const API_URL = "https://v2.jinrishici.com/one.json";
export const REQUEST_TIMEOUT = 4000;
const clean = (value, limit = 200) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";
const normalized = (value) => value.replace(/[\s\p{P}\p{S}]/gu, "");
function sourceUrl(title, author) {
  return (
    "https://zh.wikisource.org/w/index.php?search=" +
    encodeURIComponent(`${title} ${author}`)
  );
}
function linesFrom(content) {
  const parts = content
    .split(/[，。！？；\n]+/u)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length <= 4
    ? parts
    : [
        parts.slice(0, Math.ceil(parts.length / 2)).join("，"),
        parts.slice(Math.ceil(parts.length / 2)).join("，"),
      ];
}
export function normalizeOnline(payload) {
  if (
    payload?.status !== "success" ||
    !payload.data ||
    typeof payload.data !== "object"
  )
    throw new Error("Invalid API response");
  const data = payload.data,
    origin = data.origin;
  const content = clean(data.content, 200),
    title = clean(origin?.title),
    author = clean(origin?.author),
    dynasty = clean(origin?.dynasty, 40);
  const id = clean(data.id, 100);
  const original = Array.isArray(origin?.content)
    ? origin.content
        .filter((s) => typeof s === "string")
        .slice(0, 100)
        .map((s) => clean(s, 1500))
        .filter(Boolean)
        .join("\n")
        .slice(0, 30000)
    : "";
  if (
    !content ||
    !title ||
    !author ||
    !original ||
    !/^[a-zA-Z0-9_-]+$/.test(id) ||
    !normalized(original).includes(normalized(content))
  )
    throw new Error("Incomplete poem");
  const translations = Array.isArray(origin.translate)
    ? origin.translate
        .filter((s) => typeof s === "string")
        .slice(0, 100)
        .map((s) => clean(s, 1500))
        .filter(Boolean)
        .join("\n")
        .slice(0, 30000)
    : "";
  const exact = QUOTES.find(
    (q) =>
      normalized(q.lines.join("")) === normalized(content) &&
      normalized(q.author) === normalized(author),
  );
  const tags = Array.isArray(data.matchTags)
    ? data.matchTags
        .filter((s) => typeof s === "string")
        .slice(0, 6)
        .map((s) => clean(s, 16))
        .filter(Boolean)
    : [];
  return {
    id: `online:${id}`,
    lines: linesFrom(content),
    content,
    title,
    author,
    dynasty: dynasty || "古典",
    kind: "诗词",
    fullText: original,
    meaning: exact?.meaning || translations,
    meaningHeading: exact ? "句意" : "作品译文",
    appreciation: exact?.appreciation || "",
    art: exact?.art || null,
    artExact: Boolean(exact),
    source: exact?.source || sourceUrl(title, author),
    sourceLabel: "今日诗词",
    tags,
    provider: "online",
  };
}
// Reconstruct only known fields from persisted/user-supplied snapshots; URLs/art paths are never trusted.
export function restoreOnline(value) {
  if (
    !value ||
    typeof value !== "object" ||
    !/^online:[a-zA-Z0-9_-]{1,100}$/.test(value.id || "")
  )
    return null;
  const content = clean(value.content, 200),
    title = clean(value.title),
    author = clean(value.author);
  if (!content || !title || !author || !clean(value.fullText, 30000))
    return null;
  const exact = QUOTES.find(
    (q) =>
      normalized(q.lines.join("")) === normalized(content) &&
      normalized(q.author) === normalized(author),
  );
  return {
    id: value.id,
    content,
    lines: linesFrom(content),
    title,
    author,
    dynasty: clean(value.dynasty, 40) || "古典",
    kind: "诗词",
    fullText: clean(value.fullText, 30000),
    meaning: exact?.meaning || clean(value.meaning, 30000),
    meaningHeading: exact ? "句意" : "作品译文",
    appreciation: exact?.appreciation || "",
    art: exact?.art || null,
    artExact: Boolean(exact),
    source: exact?.source || sourceUrl(title, author),
    sourceLabel: "今日诗词",
    provider: "online",
    tags: Array.isArray(value.tags)
      ? value.tags
          .filter((t) => typeof t === "string")
          .slice(0, 6)
          .map((t) => clean(t, 16))
      : [],
  };
}
export function resolveFavorite(id, snapshots = {}) {
  return QUOTES.find((q) => q.id === id) || restoreOnline(snapshots?.[id]);
}
export function createOnlineClient(
  storage,
  {
    fetchImpl = (...args) => globalThis.fetch(...args),
    now = Date.now,
    timeout = REQUEST_TIMEOUT,
    minInterval = 5000,
    backoff = 60000,
  } = {},
) {
  let inFlight = null;
  return {
    async get(context) {
      if (inFlight) return inFlight;
      const run = async () => {
        const state = await storage.get("onlineState", {});
        const key = `${context.season}:${context.period}:${context.hemisphere}`;
        const last = restoreOnline(state?.quote);
        if (state?.retryAt > now()) return { status: "unavailable" };
        if (
          last &&
          state.contextKey === key &&
          now() - state.fetchedAt >= 0 &&
          now() - state.fetchedAt < minInterval
        )
          return { status: "cached", quote: last };
        const saved = await storage.get("onlineToken", "");
        const token =
          typeof saved === "string" &&
          saved.length <= 256 &&
          /^[\w+/=-]+$/.test(saved)
            ? saved
            : "";
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
          const response = await fetchImpl(API_URL, {
            signal: controller.signal,
            credentials: "include",
            cache: "no-store",
            redirect: "error",
            referrerPolicy: "no-referrer",
            headers: token ? { "X-User-Token": token } : {},
          });
          if (!response.ok) throw new Error("HTTP failure");
          const text = await response.text();
          if (text.length > 262144) throw new Error("Response too large");
          const payload = JSON.parse(text);
          const quote = normalizeOnline(payload);
          // Keep the anonymous marker only in local storage, never in a URL or displayed data.
          if (
            typeof payload.token === "string" &&
            /^[\w+/=-]{1,256}$/.test(payload.token)
          )
            await storage.set("onlineToken", payload.token);
          await storage.set("onlineState", {
            quote,
            fetchedAt: now(),
            contextKey: key,
            retryAt: 0,
          });
          return { status: "online", quote };
        } catch {
          await storage.set("onlineState", {
            quote: last,
            fetchedAt: state?.fetchedAt || 0,
            contextKey: state?.contextKey || "",
            retryAt: now() + backoff,
          });
          return { status: "unavailable" };
        } finally {
          clearTimeout(timer);
        }
      };
      inFlight = run();
      try {
        return await inFlight;
      } finally {
        inFlight = null;
      }
    },
  };
}
