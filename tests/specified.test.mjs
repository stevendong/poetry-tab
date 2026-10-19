import test from "node:test";
import assert from "node:assert/strict";
import { quotationRequest } from "../extension/service-client.js";
import { createProviderClient } from "../extension/provider-client.js";
import { createStateController } from "../extension/state.js";
import { sanitizeSettings } from "../extension/storage.js";
import { resolveFavorite } from "../extension/online.js";

const settings = sanitizeSettings({
  provider: "jinrishici", serviceUrl: "https://poetry.example/prefix?tenant=one",
});
const quote = (id = "specific-id") => ({
  id, title: "秋思", author: "张籍", dynasty: "唐", status: "published", ready: true,
  lines: ["洛阳城里见秋风", "欲作家书意万重"],
  fullText: "洛阳城里见秋风，欲作家书意万重。复恐匆匆说不尽，行人临发又开封。",
  meaning: "秋风吹起，想念家乡。", appreciation: "以秋风引出乡思。",
  background: { type: "image", url: "/specific.webp" },
  media: [
    { type: "image", url: "/specific.webp" },
    { type: "video", url: "/specific.webm", posterUrl: "/poster.webp" },
  ],
});
const response = (body) => new Response(JSON.stringify(body));

function fixture(options = {}) {
  const data = { settings: { ...settings }, history: ["old"], servicePoolState: { preserved: true } };
  const storage = {
    data,
    async get(key, fallback) { return structuredClone(data[key] ?? fallback); },
    async set(key, value) { data[key] = structuredClone(value); },
    async setMany(values) { Object.assign(data, structuredClone(values)); },
  };
  const client = createProviderClient(storage, {
    hasPermission: async () => true, fetchImpl: async () => response(quote()), ...options,
  });
  return { storage, client, controller: createStateController(storage, { onlineClient: client }) };
}

test("Quotation URLs preserve deployment prefixes and tenant query without recommendation filters", () => {
  const url = new URL(quotationRequest({ ...settings,
    serviceUrl: "https://poetry.example/deploy/api/v1/recommendation?tenant=one&season=autumn&limit=10",
  }, "some-ID_123"));
  assert.equal(url.pathname, "/deploy/api/v1/quotations/some-ID_123");
  assert.equal(url.search, "?tenant=one");
  for (const id of ["", "../secret", "a/b", "%2f", "a?b", "a#b", "a b", "a".repeat(101), null])
    assert.throws(() => quotationRequest(settings, id));
});

test("Explicit loads bypass recent history, preserve default settings/cache and support offline favorites", async () => {
  const calls = [];
  const { controller, storage } = fixture({
    fetchImpl: async (url, options) => { calls.push({ url, options }); return response(quote()); },
  });
  const first = await controller.handle({ type: "load", id: "specific-id" });
  const repeated = await controller.handle({ type: "load", id: "specific-id" });
  assert.equal(first.status, "loaded");
  assert.equal(first.source, "specified");
  assert.equal(repeated.quote.id, first.quote.id);
  assert.equal(first.quote.remoteId, "specific-id");
  assert.equal(first.quote.media.url, "https://poetry.example/specific.webp");
  assert.equal(first.quote.fullText, quote().fullText);
  assert.deepEqual(storage.data.settings, settings);
  assert.deepEqual(storage.data.servicePoolState, { preserved: true });
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[0].url).pathname, "/prefix/api/v1/quotations/specific-id");
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(calls[0].options.cache, "no-store");
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(calls[0].options.headers, undefined);
  await controller.handle({ type: "favorite", id: first.quote.id, quote: first.quote });
  assert.equal(resolveFavorite(first.quote.id, storage.data.favoriteSnapshots).fullText, quote().fullText);
});

test("Explicit loads honor video preference and require the exact published quotation ID", async () => {
  const { controller, storage } = fixture();
  storage.data.settings.mediaPreference = "video";
  const result = await controller.handle({ type: "load", id: "specific-id" });
  assert.equal(result.quote.media.type, "video");
  assert.equal(result.quote.media.posterUrl, "https://poetry.example/poster.webp");
  for (const [record, status] of [
    [quote("different-id"), "invalid_response"],
    [{ ...quote(), status: "draft" }, "not_found"],
    [{ ...quote(), ready: false }, "not_found"],
  ]) {
    const { controller, storage } = fixture({ fetchImpl: async () => response(record) });
    assert.equal((await controller.handle({ type: "load", id: "specific-id" })).status, status);
    assert.deepEqual(storage.data.history, ["old"]);
  }
});

test("Invalid IDs, denied permission and offline mode perform no requests", async () => {
  let calls = 0;
  const { controller, storage } = fixture({
    hasPermission: async () => false,
    fetchImpl: async () => { calls++; return response(quote()); },
  });
  assert.equal((await controller.handle({ type: "load", id: "../invalid" })).status, "invalid_id");
  assert.equal((await controller.handle({ type: "load", id: "specific-id" })).status, "permission");
  storage.data.settings.onlineEnabled = false;
  assert.equal((await controller.handle({ type: "load", id: "specific-id" })).status, "disabled");
  assert.equal(calls, 0);
  assert.deepEqual(storage.data.history, ["old"]);
});

test("Missing, rate-limited, malformed, oversized and timed-out data fail without changing the selection history", async () => {
  for (const [fetchImpl, status] of [
    [async () => new Response("missing", { status: 404 }), "not_found"],
    [async () => new Response("limited", { status: 429 }), "rate_limited"],
    [async () => new Response("{invalid"), "unavailable"],
    [async () => new Response("large", { headers: { "Content-Length": "300000" } }), "unavailable"],
    [async (_url, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true })), "unavailable"],
  ]) {
    const { controller, storage } = fixture({ fetchImpl, timeout: 15 });
    assert.equal((await controller.handle({ type: "load", id: "specific-id" })).status, status);
    assert.deepEqual(storage.data.history, ["old"]);
    assert.deepEqual(storage.data.servicePoolState, { preserved: true });
  }
});

test("Disabling online access or changing service settings discards a late explicit load", async () => {
  for (const change of [{ onlineEnabled: false }, { serviceUrl: "https://different.example" }, { mediaPreference: "video" }]) {
    let started;
    let release;
    const loading = new Promise((resolve) => { started = resolve; });
    const { controller, storage } = fixture({
      fetchImpl: async () => { started(); return new Promise((resolve) => { release = () => resolve(response(quote())); }); },
    });
    const result = controller.handle({ type: "load", id: "specific-id" });
    await loading;
    Object.assign(storage.data.settings, change);
    release();
    assert.equal((await result).status, change.onlineEnabled === false ? "disabled" : "changed");
    assert.deepEqual(storage.data.history, ["old"]);
  }
});
