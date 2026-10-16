export const SERVICE_URL = "https://poetry-api.nabulalogic.com";
const clean = (v, max = 200) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const normalized = (v) => v.normalize("NFKC").replace(/[\s\p{P}\p{S}]/gu, "");

export function httpUrl(value, base) {
  if (typeof value !== "string" || !value.trim() || value.length > 2048)
    return null;
  try {
    const url = new URL(value.trim(), base);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hash
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
export function endpointFor(settings) {
  if (settings.provider === "jinrishici")
    return "https://v2.jinrishici.com/one.json";
  const raw =
    settings.provider === "service" ? settings.serviceUrl : settings.customUrl;
  const valid = httpUrl(raw);
  if (!valid)
    throw new Error(
      "请填写有效的 HTTP 或 HTTPS 接口地址，不含账号、密码或片段",
    );
  const url = new URL(valid);
  if (settings.provider === "service") {
    url.pathname =
      url.pathname
        .replace(/\/$/, "")
        .replace(/\/api\/v1\/recommendation$/, "") + "/api/v1/recommendation";
  }
  return url.href;
}
export function originPattern(endpoint) {
  const url = new URL(endpoint);
  return `${url.protocol}//${url.hostname}/*`;
}
// Stable namespacing prevents equal IDs on different services from sharing favorites.
function key(value) {
  let n = 14695981039346656037n;
  for (const byte of new TextEncoder().encode(value))
    n = BigInt.asUintN(64, (n ^ BigInt(byte)) * 1099511628211n);
  return n.toString(16).padStart(16, "0");
}
export function customId(endpoint, remoteId) {
  return `custom:${key(endpoint)}:${key(remoteId)}`;
}
export function normalizeCustom(payload, settings) {
  const endpoint = endpointFor(settings);
  const q = payload?.quote ?? payload?.data ?? payload;
  if (!q || typeof q !== "object" || Array.isArray(q))
    throw new Error("接口未返回诗句");
  if (
    settings.provider === "service" &&
    (q.status !== "published" || q.ready !== true)
  )
    throw new Error("诗句尚未发布");
  const lines = Array.isArray(q.lines)
    ? q.lines
        .slice(0, 4)
        .map((v) => clean(v, 200))
        .filter(Boolean)
    : clean(q.content, 800)
        .split(/[，。！？；\n]+/u)
        .filter(Boolean)
        .slice(0, 4);
  const content = lines.join("，"),
    title = clean(q.title),
    author = clean(q.author);
  const fullText =
    clean(q.fullText, 50000) || (settings.provider === "custom" ? content : "");
  if (
    !normalized(content) ||
    !title ||
    !author ||
    !fullText ||
    !normalized(fullText).includes(normalized(content))
  )
    throw new Error("诗句或作品原文格式不正确");
  const remoteId =
    clean(q.id, 100) || `generated-${key(`${title}:${author}:${content}`)}`;
  const background =
    q.background ??
    (q.videoUrl
      ? { type: "video", url: q.videoUrl, posterUrl: q.posterUrl }
      : q.imageUrl
        ? { type: "image", url: q.imageUrl }
        : null);
  let media = null;
  if (background && ["image", "video"].includes(background.type)) {
    const url = httpUrl(background.url, endpoint),
      posterUrl = httpUrl(background.posterUrl, endpoint);
    if (url && (background.type === "image" || posterUrl))
      media = {
        type: background.type,
        url,
        posterUrl,
        palette: background.palette === "light" ? "light" : "dark",
      };
  }
  return {
    id: customId(endpoint, remoteId),
    remoteId,
    endpoint,
    apiProvider: settings.provider,
    provider: "custom",
    sourceLabel: settings.provider === "service" ? "诗画库" : "自定义接口",
    lines,
    content,
    title,
    author,
    dynasty: clean(q.dynasty, 40) || "古典",
    kind: clean(q.kind, 20) || "诗词",
    fullText,
    meaning: clean(q.meaning, 30000),
    meaningHeading: "句意",
    appreciation: clean(q.appreciation, 30000),
    excerpt: q.excerpt === true,
    source:
      httpUrl(q.source, endpoint) ||
      "https://zh.wikisource.org/w/index.php?search=" +
        encodeURIComponent(`${title} ${author}`),
    tags: (Array.isArray(q.tags) ? q.tags : [])
      .slice(0, 6)
      .map((v) => clean(v, 16))
      .filter(Boolean),
    media,
    art: null,
    artExact: false,
  };
}
export function restoreCustom(value) {
  if (
    !value ||
    value.provider !== "custom" ||
    !["service", "custom"].includes(value.apiProvider)
  )
    return null;
  try {
    const settings = {
      provider: value.apiProvider,
      serviceUrl: value.endpoint,
      customUrl: value.endpoint,
    };
    const quote = normalizeCustom(
      {
        ...value,
        id: value.remoteId,
        status: "published",
        ready: true,
        background: value.media,
      },
      settings,
    );
    return quote.id === value.id ? quote : null;
  } catch {
    return null;
  }
}
export function customRequest(settings, context, exclusions = []) {
  const url = new URL(endpointFor(settings));
  if (settings.provider === "service") {
    url.searchParams.set("season", context.season);
    url.searchParams.set("period", context.period);
    url.searchParams.delete("term");
    if (context.hemisphere !== "south" && context.term)
      url.searchParams.set("term", context.term);
    url.searchParams.set("prefer", settings.mediaPreference || "image");
    url.searchParams.delete("exclude");
    if (exclusions.length)
      url.searchParams.set("exclude", exclusions.slice(-6).join(","));
  }
  return url.href;
}
export function retryAfterMs(value, now = Date.now()) {
  const raw = typeof value === "string" ? value.trim() : "";
  const delay = /^\d+$/.test(raw) ? Number(raw) * 1000 : Date.parse(raw) - now;
  return Number.isFinite(delay)
    ? Math.min(3600000, Math.max(1000, delay))
    : 60000;
}
export async function readJson(response, maxBytes = 262144) {
  if (!response.ok) {
    const error = new Error("HTTP failure");
    error.status = response.status;
    error.retryAfter = response.headers?.get("retry-after");
    await response.body?.cancel();
    throw error;
  }
  if (Number(response.headers?.get("content-length")) > maxBytes)
    throw new Error("Response too large");
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).length > maxBytes)
      throw new Error("Response too large");
    return JSON.parse(text);
  }
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error("Response too large");
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
