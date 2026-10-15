import test from "node:test";
import assert from "node:assert/strict";
import {
  endpointFor,
  httpUrl,
  originPattern,
  normalizeCustom,
  restoreCustom,
  customRequest,
  readJson,
} from "../extension/custom.js";
import { createProviderClient } from "../extension/provider-client.js";
import { createStateController } from "../extension/state.js";
import { resolveFavorite } from "../extension/online.js";
import { sanitizeSettings } from "../extension/storage.js";

const context = {
  season: "autumn",
  period: "day",
  term: "寒露",
  hemisphere: "north",
};
const settings = sanitizeSettings({
  provider: "service",
  serviceUrl: "https://poetry.example",
});
const quote = (id = "one") => ({
  id,
  lines: ["洛阳城里见秋风", "欲作家书意万重"],
  title: "秋思",
  author: "张籍",
  dynasty: "唐",
  fullText: "洛阳城里见秋风，欲作家书意万重。复恐匆匆说不尽，行人临发又开封。",
  meaning: "秋风吹起，想念家乡。",
  appreciation: "以秋风引出乡思。",
  status: "published",
  ready: true,
  source: "https://example.com/poem",
  background: { type: "image", url: "/media/art.webp", palette: "light" },
});
const response = (value) => new Response(JSON.stringify(value));
function memory(initial = {}) {
  const data = structuredClone(initial);
  return {
    data,
    async get(k, f) {
      return structuredClone(data[k] ?? f);
    },
    async set(k, v) {
      data[k] = structuredClone(v);
    },
    async setMany(v) {
      Object.assign(data, structuredClone(v));
    },
  };
}

test("service URL accepts root, deployment prefix or recommendation endpoint and preserves query", () => {
  for (const [url, expected] of [
    ["https://p.test/", "https://p.test/api/v1/recommendation"],
    ["http://127.0.0.1:7020", "http://127.0.0.1:7020/api/v1/recommendation"],
    ["https://p.test/prefix/", "https://p.test/prefix/api/v1/recommendation"],
    [
      "https://p.test/api/v1/recommendation?x=y",
      "https://p.test/api/v1/recommendation?x=y",
    ],
  ])
    assert.equal(endpointFor({ ...settings, serviceUrl: url }), expected);
  assert.equal(
    originPattern("http://127.0.0.1:7020/api"),
    "http://127.0.0.1/*",
  );
  for (const url of [
    "javascript:alert(1)",
    "file:///tmp/a",
    "data:text/plain,hi",
    "https://user:pass@p.test/",
    "https://p.test/#fragment",
    "bad",
    "",
  ]) {
    assert.equal(httpUrl(url), null);
    assert.throws(() => endpointFor({ ...settings, serviceUrl: url }));
  }
});
test("service recommendation uses time context, preference and exclusions; south omits Chinese term", () => {
  const url = new URL(
    customRequest({ ...settings, mediaPreference: "video" }, context, [
      "a",
      "b",
    ]),
  );
  assert.equal(url.searchParams.get("season"), "autumn");
  assert.equal(url.searchParams.get("period"), "day");
  assert.equal(url.searchParams.get("term"), "寒露");
  assert.equal(url.searchParams.get("prefer"), "video");
  assert.equal(url.searchParams.get("exclude"), "a,b");
  assert.equal(
    new URL(
      customRequest(settings, { ...context, hemisphere: "south" }),
    ).searchParams.has("term"),
    false,
  );
  const custom = {
    provider: "custom",
    customUrl: "https://p.test/random?lang=zh",
  };
  assert.equal(customRequest(custom, context), custom.customUrl);
});
test("service adapters keep full work, interpretations and selected image or video", () => {
  const q = normalizeCustom({ quote: quote() }, settings);
  assert.deepEqual(q.lines, quote().lines);
  assert.equal(q.fullText, quote().fullText);
  assert.equal(q.meaning, quote().meaning);
  assert.equal(q.media.url, "https://poetry.example/media/art.webp");
  assert.equal(q.media.palette, "light");
  const v = normalizeCustom(
    {
      quote: {
        ...quote(),
        background: {
          type: "video",
          url: "/media/movie.webm",
          posterUrl: "https://cdn.test/poster.webp",
        },
      },
    },
    settings,
  );
  assert.equal(v.media.type, "video");
  assert.equal(v.media.posterUrl, "https://cdn.test/poster.webp");
  assert.deepEqual(restoreCustom(v), v);
  for (const invalid of [
    { ...quote(), status: "draft" },
    { ...quote(), ready: false },
    { ...quote(), fullText: "无关原文" },
    { ...quote(), lines: [] },
    { ...quote(), title: "" },
  ])
    assert.throws(() => normalizeCustom({ quote: invalid }, settings));
});
test("generic JSON accepts direct and wrapped records, optional full text and safe media", () => {
  const s = { provider: "custom", customUrl: "https://p.test/random" };
  for (const wrap of [(q) => q, (q) => ({ data: q }), (q) => ({ quote: q })]) {
    const q = normalizeCustom(
      wrap({
        content: "海内存知己，天涯若比邻。",
        title: "送杜少府之任蜀州",
        author: "王勃",
        imageUrl: "https://cdn.test/a.webp",
      }),
      s,
    );
    assert.equal(q.fullText, "海内存知己，天涯若比邻");
    assert.equal(q.media.url, "https://cdn.test/a.webp");
    assert.equal(q.sourceLabel, "自定义接口");
    assert.deepEqual(restoreCustom(q), q);
  }
  const v = normalizeCustom(
    { ...quote(), background: null, videoUrl: "/v.webm", posterUrl: "/p.webp" },
    s,
  );
  assert.equal(v.media.type, "video");
});
test("untrusted media and source URLs never become executable or authenticated URLs", () => {
  for (const bad of [
    "javascript:alert(1)",
    "data:image/svg+xml,bad",
    "file:///tmp/a",
    "https://user:pass@cdn.test/a",
  ]) {
    const q = normalizeCustom(
      {
        quote: {
          ...quote(),
          source: bad,
          background: { type: "image", url: bad },
        },
      },
      settings,
    );
    assert.equal(q.media, null);
    assert.ok(q.source.startsWith("https://zh.wikisource.org/"));
  }
  assert.equal(
    normalizeCustom(
      { quote: { ...quote(), background: { type: "video", url: "/v.webm" } } },
      settings,
    ).media,
    null,
  );
  const q = normalizeCustom({ quote: quote() }, settings);
  assert.equal(restoreCustom({ ...q, id: "custom:bad:bad" }), null);
  assert.equal(restoreCustom({ ...q, endpoint: "javascript:bad" }), null);
});
test("custom IDs and favorite snapshots are isolated by endpoint, including equal remote IDs", () => {
  const a = normalizeCustom({ quote: quote() }, settings),
    b = normalizeCustom(
      { quote: quote() },
      { ...settings, serviceUrl: "https://other.test" },
    );
  assert.notEqual(a.id, b.id);
  assert.deepEqual(resolveFavorite(a.id, { [a.id]: a }), a);
  assert.equal(resolveFavorite(a.id, { [a.id]: { ...a, id: b.id } }), null);
});
test("custom client never forwards Jinrishici tokens or cookies; permission is checked before cache", async () => {
  const store = memory({ onlineToken: "private-jinrishici-token" });
  let allowed = true,
    calls = [];
  const client = createProviderClient(store, {
    hasPermission: async () => allowed,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response({ quote: quote() });
    },
  });
  const first = await client.get(context, settings);
  assert.equal(first.status, "online");
  assert.equal((await client.get(context, settings)).status, "cached");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(calls[0].options.headers, undefined);
  assert.equal(calls[0].options.redirect, "error");
  allowed = false;
  assert.equal((await client.get(context, settings)).status, "permission");
  assert.equal(calls.length, 1);
});
test("cache, in-flight work and failure backoff are isolated across provider settings", async () => {
  const store = memory();
  let calls = 0;
  const client = createProviderClient(store, {
    fetchImpl: async (url) => {
      calls++;
      await new Promise((r) => setTimeout(r, 5));
      if (url.startsWith("https://poetry.example"))
        return new Response("", { status: 503 });
      return response({ quote: quote() });
    },
  });
  const [a, b] = await Promise.all([
    client.get(context, settings),
    client.get(context, settings),
  ]);
  assert.equal(a.status, "unavailable");
  assert.equal(b.status, "unavailable");
  assert.equal(calls, 1);
  await client.get(context, settings);
  assert.equal(calls, 1);
  assert.equal(
    (
      await client.get(context, {
        ...settings,
        serviceUrl: "https://other.test",
      })
    ).status,
    "online",
  );
  assert.equal(calls, 2);
});
test("changing background preference invalidates cache and known recent IDs become exclusions", async () => {
  const store = memory();
  let urls = [];
  const client = createProviderClient(store, {
    fetchImpl: async (url) => {
      urls.push(new URL(url));
      return response({ quote: quote("q" + urls.length) });
    },
  });
  const a = await client.get(context, settings);
  await client.get(context, settings, { currentId: a.quote.id });
  assert.equal(urls[1].searchParams.get("exclude"), "q1");
  await client.get(context, { ...settings, mediaPreference: "video" });
  assert.equal(urls[2].searchParams.get("prefer"), "video");
});
test("JSON streaming is bounded by bytes even without Content-Length", async () => {
  await assert.rejects(readJson(new Response("中".repeat(90000))), /too large/);
  await assert.rejects(
    readJson(new Response("{}", { headers: { "Content-Length": "999999" } })),
    /too large/,
  );
});
test("custom timeout, malformed JSON and empty recommendation fail to offline with backoff", async () => {
  for (const fetchImpl of [
    async () => new Response("{bad"),
    async () => response({ quote: null }),
    async () => response({ quote: {} }),
    async (_, { signal }) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(new Error("timeout"))),
      ),
  ]) {
    const store = memory({ settings });
    let count = 0;
    const client = createProviderClient(store, {
      timeout: 10,
      fetchImpl: async (...args) => {
        count++;
        return fetchImpl(...args);
      },
    });
    const controller = createStateController(store, { onlineClient: client });
    const result = await controller.handle({ type: "select" });
    assert.equal(result.source, "offline");
    assert.equal(result.status, "unavailable");
    await controller.handle({ type: "select" });
    assert.equal(count, 1);
  }
});
test("switching service during an in-flight response discards the stale poem", async () => {
  const store = memory({ settings });
  let release;
  const pending = new Promise((r) => (release = r));
  const controller = createStateController(store, {
    onlineClient: { get: () => pending },
  });
  const result = controller.handle({ type: "select" });
  await new Promise((r) => setTimeout(r, 0));
  await store.set("settings", { ...settings, serviceUrl: "https://new.test" });
  release({
    status: "online",
    quote: normalizeCustom({ quote: quote() }, settings),
  });
  assert.equal((await result).source, "offline");
});
test("custom favorites survive restarts, coexist with offline ones and remain removable", async () => {
  const store = memory({ favorites: ["spring-dawn"] });
  const q = normalizeCustom({ quote: quote() }, settings);
  const controller = createStateController(store);
  const saved = await controller.handle({
    type: "favorite",
    id: q.id,
    quote: q,
  });
  assert.deepEqual(saved.favorites, ["spring-dawn", q.id]);
  const restarted = createStateController(store);
  assert.equal(
    resolveFavorite(q.id, store.data.favoriteSnapshots).meaning,
    q.meaning,
  );
  const removed = await restarted.handle({ type: "favorite", id: q.id });
  assert.deepEqual(removed.favorites, ["spring-dawn"]);
  assert.deepEqual(removed.favoriteSnapshots, {});
});

test("generic responses without IDs retain stable favorites for long poems", () => {
  const s = { provider: "custom", customUrl: "https://p.test/random" };
  const q = normalizeCustom(
    { content: "海内存知己".repeat(30), title: "长句", author: "作者" },
    s,
  );
  assert.deepEqual(restoreCustom(q), q);
  assert.throws(() =>
    normalizeCustom({ content: "。。。", title: "作品", author: "作者" }, s),
  );
});
