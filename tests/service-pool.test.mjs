import test from "node:test";
import assert from "node:assert/strict";
import { createProviderClient } from "../extension/provider-client.js";
import { createStateController } from "../extension/state.js";
import { candidatesRequest } from "../extension/service-client.js";
import { retryAfterMs } from "../extension/custom.js";
import { getContext } from "../extension/context.js";
import { sanitizeSettings } from "../extension/storage.js";

const date = new Date(2026, 9, 16, 12);
const context = getContext(date);
const settings = sanitizeSettings({
  provider: "service",
  serviceUrl: "https://poetry.example/prefix",
});
const quote = (id) => ({
  id,
  title: "秋思",
  author: "张籍",
  fullText: "洛阳城里见秋风，欲作家书意万重。",
  lines: ["洛阳城里见秋风", "欲作家书意万重"],
  status: "published",
  ready: true,
  background: { type: "image", url: "/art.webp" },
});
const response = (items) => new Response(JSON.stringify({ items }));
function memory(extra = {}) {
  const data = { settings, ...structuredClone(extra) };
  return {
    data,
    async get(k, fallback) {
      return structuredClone(data[k] ?? fallback);
    },
    async set(k, v) {
      data[k] = structuredClone(v);
    },
  };
}
function fixture({
  fetchImpl,
  now = Date.now,
  storage = memory(),
  hasPermission = async () => true,
} = {}) {
  const client = createProviderClient(storage, {
    fetchImpl,
    now,
    hasPermission,
  });
  return {
    storage,
    client,
    controller: createStateController(storage, {
      onlineClient: client,
      date: () => date,
      random: () => 0,
    }),
  };
}

test("Three contextual candidates survive the fourth and twentieth refresh with one request", async () => {
  const calls = [];
  const { controller, storage } = fixture({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response([quote("one"), quote("two"), quote("three")]);
    },
  });
  let currentId;
  const ids = [];
  for (let i = 0; i < 20; i++) {
    const result = await controller.handle({ type: "select", currentId });
    assert.equal(result.quote.provider, "custom");
    assert(["online", "cached"].includes(result.status));
    assert.notEqual(result.quoteId, currentId);
    currentId = result.quoteId;
    ids.push(currentId);
  }
  assert.equal(new Set(ids.slice(0, 3)).size, 3);
  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, "/prefix/api/v1/candidates");
  assert.equal(url.searchParams.get("limit"), "10");
  assert.equal(url.searchParams.has("exclude"), false);
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(calls[0].options.headers, undefined);
  const restart = fixture({
    storage,
    fetchImpl: async () => {
      throw new Error("Must reuse saved pool");
    },
  });
  assert.equal(
    (await restart.controller.handle({ type: "select", currentId })).quote
      .provider,
    "custom",
  );
});

test("Concurrent tabs share one fetch and choose candidates against the latest saved history", async () => {
  let calls = 0;
  const { controller } = fixture({
    fetchImpl: async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 5));
      return response([quote("one"), quote("two"), quote("three")]);
    },
  });
  const results = await Promise.all(
    Array.from({ length: 8 }, () => controller.handle({ type: "select" })),
  );
  assert.equal(calls, 1);
  assert(results.every((r) => r.quote.provider === "custom"));
  for (let i = 1; i < results.length; i++)
    assert.notEqual(results[i].quoteId, results[i - 1].quoteId);
});

test("A single candidate remains usable instead of falsely reporting an outage", async () => {
  let calls = 0;
  const { controller } = fixture({
    fetchImpl: async () => {
      calls++;
      return response([quote("one")]);
    },
  });
  let currentId;
  for (let i = 0; i < 5; i++) {
    const r = await controller.handle({ type: "select", currentId });
    assert.equal(r.quote.provider, "custom");
    currentId = r.quoteId;
  }
  assert.equal(calls, 1);
});

test("Startup selects cached poems with matching backgrounds and reserves history across tabs", async () => {
  let clock = 1000;
  let calls = 0;
  const items = ["one", "two", "three"].map((id) => ({
    ...quote(id), background: { type: "image", url: `/${id}.webp` },
  }));
  const { controller, storage } = fixture({
    now: () => clock,
    fetchImpl: async () => { calls++; return response(items); },
  });
  await controller.handle({ type: "select" });
  clock += 61000;
  const results = await Promise.all([1, 2].map(() =>
    controller.handle({ type: "select", cacheOnly: true, initial: true }),
  ));
  assert.equal(calls, 1, "Startup reads never fetch an expired pool");
  assert.notEqual(results[0].quoteId, results[1].quoteId);
  for (const result of results) {
    assert.equal(result.source, "cached");
    assert.equal(result.quote.media.url, `https://poetry.example/${result.quote.remoteId}.webp`);
    assert(!result.prefetch.includes(result.quote.media.url));
  }
  assert.deepEqual(storage.data.history.slice(-2), results.map((r) => r.quoteId));
});

test("Cached startup never waits for an in-flight refresh; refreshing does not change history", async () => {
  let clock = 1000;
  let release;
  let started;
  const loading = new Promise((resolve) => { started = resolve; });
  let calls = 0;
  const { controller, storage } = fixture({
    now: () => clock,
    fetchImpl: async () => {
      if (++calls === 1) return response([quote("one"), quote("two")]);
      started();
      return new Promise((resolve) => { release = () => resolve(response([quote("new")])); });
    },
  });
  await controller.handle({ type: "select" });
  clock += 61000;
  const refreshing = controller.handle({ type: "select", refreshOnly: true });
  await loading;
  let timer;
  try {
    const cached = await Promise.race([
      controller.handle({ type: "select", cacheOnly: true }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Startup waited for network")), 1000); }),
    ]);
    assert.equal(cached.source, "cached");
    const history = [...storage.data.history];
    release();
    const refreshed = await refreshing;
    assert.equal(refreshed.quote, undefined);
    assert.deepEqual(storage.data.history, history);
    assert.equal(storage.data.servicePoolState.items[0].remoteId, "new");
  } finally {
    clearTimeout(timer);
    release();
    await refreshing;
  }
});

test("Startup rejects expired, mismatched, disabled and unauthorized caches without fetching or changing history", async () => {
  let clock = 1000;
  let allowed = true;
  let calls = 0;
  const { controller, storage } = fixture({
    now: () => clock,
    hasPermission: async () => allowed,
    fetchImpl: async () => { calls++; return response([quote("one"), quote("two")]); },
  });
  await controller.handle({ type: "select" });
  const history = [...storage.data.history];
  for (const override of [
    { onlineEnabled: false }, { serviceUrl: "https://different.example" },
    { provider: "custom", customUrl: settings.serviceUrl },
    { mediaPreference: "video" }, { hemisphere: "south" },
  ]) {
    storage.data.settings = { ...settings, ...override };
    assert.equal(await controller.handle({ type: "select", cacheOnly: true }), null);
  }
  storage.data.settings = settings;
  allowed = false;
  assert.equal(await controller.handle({ type: "select", cacheOnly: true }), null);
  allowed = true;
  clock += 600000;
  assert.equal(await controller.handle({ type: "select", cacheOnly: true }), null);
  assert.equal(calls, 1);
  assert.deepEqual(storage.data.history, history);
});

test("Candidate preloads include image URLs and video posters, never video streams", async () => {
  const { controller } = fixture({
    fetchImpl: async () => response([
      { ...quote("one"), background: { type: "image", url: "/one.webp" } },
      { ...quote("two"), background: { type: "video", url: "/two.webm", posterUrl: "/poster.webp" } },
      { ...quote("three"), background: { type: "image", url: "/three.webp" } },
    ]),
  });
  const selected = await controller.handle({ type: "select" });
  assert.deepEqual(selected.prefetch, ["https://poetry.example/poster.webp", "https://poetry.example/three.webp"]);
  const refreshed = await controller.handle({ type: "select", refreshOnly: true });
  assert.equal(refreshed.prefetch.length, 3);
  assert(refreshed.prefetch.every((src) => !src.endsWith(".webm")));
});

test("A custom API startup can reuse its last displayed poem while refreshing the next image", async () => {
  let calls = 0;
  const storage = memory({ settings: { ...settings, provider: "custom", customUrl: "https://poetry.example/generic" } });
  const { controller } = fixture({
    storage,
    fetchImpl: async () => new Response(JSON.stringify({
      ...quote(`custom-${++calls}`), background: { type: "image", url: `/custom-${calls}.webp` },
    })),
  });
  const first = await controller.handle({ type: "select" });
  const cached = await controller.handle({ type: "select", cacheOnly: true, initial: true });
  assert.equal(cached.quoteId, first.quoteId);
  assert.equal(cached.source, "cached");
  assert.equal(calls, 1);
  const history = [...storage.data.history];
  const refresh = await controller.handle({ type: "select", refreshOnly: true, currentId: first.quoteId });
  assert.deepEqual(refresh.prefetch, ["https://poetry.example/custom-2.webp"]);
  assert.equal(calls, 2);
  assert.deepEqual(storage.data.history, history);
});

test("Pool cache expires and isolates context, service and background preference; old failure cooldown is ignored", async () => {
  let clock = 1000,
    calls = 0;
  const storage = memory({ customOnlineState: { retryAt: Infinity } });
  const { client } = fixture({
    storage,
    now: () => clock,
    fetchImpl: async () => {
      calls++;
      return response([quote("one")]);
    },
  });
  assert.equal((await client.get(context, settings)).status, "online");
  assert.equal((await client.get(context, settings)).status, "cached");
  clock += 60000;
  assert.equal((await client.get(context, settings)).status, "online");
  await client.get({ ...context, period: "night" }, settings);
  await client.get(context, { ...settings, mediaPreference: "video" });
  await client.get(context, {
    ...settings,
    serviceUrl: "https://other.example",
  });
  assert.equal(calls, 5);
  const south = new URL(
    candidatesRequest(settings, { ...context, hemisphere: "south" }),
  );
  assert.equal(south.searchParams.has("term"), false);
});

test("429 uses Retry-After, rotates cached poems and resumes after the actual cooldown", async () => {
  let clock = 1000,
    calls = 0;
  const { controller } = fixture({
    now: () => clock,
    fetchImpl: async () => {
      calls++;
      return calls === 2
        ? new Response("limited", {
            status: 429,
            headers: { "Retry-After": "10" },
          })
        : response([quote("one"), quote("two"), quote("three")]);
    },
  });
  const first = await controller.handle({ type: "select" });
  clock += 60000;
  const limited = await controller.handle({
    type: "select",
    currentId: first.quoteId,
  });
  assert.equal(limited.status, "rate_limited");
  assert.equal(limited.source, "cached");
  assert.notEqual(limited.quoteId, first.quoteId);
  const cooling = await controller.handle({
    type: "select",
    currentId: limited.quoteId,
  });
  assert.equal(cooling.status, "rate_limited");
  assert.equal(calls, 2);
  clock += 10000;
  assert.equal(
    (await controller.handle({ type: "select", currentId: cooling.quoteId }))
      .status,
    "online",
  );
  assert.equal(calls, 3);
});

test("Cold-start rate limits and empty results are distinct from network failure and do not hammer the API", async () => {
  for (const [responseFactory, expected] of [
    [
      () => new Response("", { status: 429, headers: { "Retry-After": "10" } }),
      "rate_limited",
    ],
    [() => response([]), "empty"],
    [() => new Response("", { status: 503 }), "unavailable"],
  ]) {
    let calls = 0;
    const { controller } = fixture({
      fetchImpl: async () => {
        calls++;
        return responseFactory();
      },
    });
    for (let i = 0; i < 3; i++) {
      const r = await controller.handle({ type: "select" });
      assert.equal(r.source, "offline");
      assert.equal(r.status, expected);
    }
    assert.equal(calls, 1);
  }
});

test("An empty successful refresh clears old content, whereas transient failures only reuse a bounded stale cache", async () => {
  for (const empty of [true, false]) {
    let clock = 1000,
      calls = 0;
    const { controller, storage } = fixture({
      now: () => clock,
      fetchImpl: async () => {
        calls++;
        return calls === 1
          ? response([quote("one")])
          : empty
            ? response([])
            : new Response("", { status: 503 });
      },
    });
    await controller.handle({ type: "select" });
    clock += 60000;
    const r = await controller.handle({ type: "select" });
    assert.equal(r.status, empty ? "empty" : "unavailable");
    assert.equal(r.source, empty ? "offline" : "cached");
    if (empty) assert.equal(storage.data.servicePoolState.items.length, 0);
    clock += 600001;
    assert.equal(
      (await controller.handle({ type: "select" })).source,
      "offline",
    );
  }
});

test("Permission checks precede saved pools and videos use the returned background image as poster", async () => {
  let allowed = true;
  const item = {
    ...quote("one"),
    media: [
      { type: "image", url: "/i.webp" },
      {
        type: "video",
        url: "/v.webm",
        posterUrl: "/poster.webp",
        active: true,
      },
    ],
  };
  const { client } = fixture({
    hasPermission: async () => allowed,
    fetchImpl: async () => response([item]),
  });
  const video = await client.get(context, {
    ...settings,
    mediaPreference: "video",
  });
  assert.equal(video.quotes[0].media.type, "video");
  assert.equal(
    video.quotes[0].media.posterUrl,
    "https://poetry.example/art.webp",
  );
  allowed = false;
  assert.equal(
    (await client.get(context, { ...settings, mediaPreference: "video" }))
      .status,
    "permission",
  );
});

test("Candidate videos can use their own quotation image when posterUrl is null", async () => {
  const { client } = fixture({
    fetchImpl: async () => response(["one", "two"].map((id) => ({
      ...quote(id),
      background: { type: "image", url: `/${id}.webp` },
      media: [{ type: "video", url: `/${id}.mp4`, posterUrl: null }],
    }))),
  });
  const result = await client.get(context, { ...settings, mediaPreference: "video" });
  for (const quote of result.quotes) {
    assert.equal(quote.media.type, "video");
    assert.equal(quote.media.url, `https://poetry.example/${quote.remoteId}.mp4`);
    assert.equal(quote.media.posterUrl, `https://poetry.example/${quote.remoteId}.webp`);
  }
});

test("Generic custom APIs also retain 429 status and accept bounded numeric or date Retry-After", async () => {
  let clock = Date.parse("2026-10-16T02:00:00Z"),
    calls = 0;
  const custom = {
    ...settings,
    provider: "custom",
    customUrl: "https://example.test/random",
  };
  const { client } = fixture({
    now: () => clock,
    fetchImpl: async () => {
      calls++;
      return new Response("", {
        status: 429,
        headers: { "Retry-After": new Date(clock + 10000).toUTCString() },
      });
    },
  });
  assert.equal((await client.get(context, custom)).status, "rate_limited");
  clock += 9999;
  assert.equal((await client.get(context, custom)).status, "rate_limited");
  assert.equal(calls, 1);
  clock++;
  await client.get(context, custom);
  assert.equal(calls, 2);
  assert.equal(retryAfterMs(null, clock), 60000);
  assert.equal(retryAfterMs("0", clock), 1000);
  assert.equal(retryAfterMs("99999999", clock), 3600000);
});
