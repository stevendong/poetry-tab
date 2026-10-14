import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeOnline,
  restoreOnline,
  matchArt,
  createOnlineClient,
  API_URL,
  resolveFavorite,
} from "../extension/online.js";
import { createStateController } from "../extension/state.js";
import { QUOTES } from "../extension/quotes.js";

const context = {
  season: "autumn",
  period: "day",
  hemisphere: "north",
  term: "寒露",
};
const fixture = (overrides = {}) => ({
  status: "success",
  token: "test-marker",
  data: {
    id: "autumn-thought",
    content: "洛阳城里见秋风，欲作家书意万重。",
    origin: {
      title: "秋思",
      author: "张籍",
      dynasty: "唐代",
      content: [
        "洛阳城里见秋风，欲作家书意万重。",
        "复恐匆匆说不尽，行人临发又开封。",
      ],
      translate: ["秋风吹到洛阳，想写家书却有许多话要说。"],
    },
    matchTags: ["秋"],
    ...overrides,
  },
});
function memory(initial = {}) {
  const data = structuredClone(initial);
  return {
    data,
    async get(key, fallback) {
      return structuredClone(data[key] ?? fallback);
    },
    async set(key, value) {
      data[key] = structuredClone(value);
    },
    async setMany(values) {
      Object.assign(data, structuredClone(values));
    },
  };
}
const response = (value) =>
  new Response(JSON.stringify(value), { status: 200 });

test("online result carries real full text, translation, provider and semantic art", () => {
  const quote = normalizeOnline(fixture(), context);
  assert.equal(quote.id, "online:autumn-thought");
  assert.deepEqual(quote.lines, ["洛阳城里见秋风", "欲作家书意万重"]);
  assert.equal(quote.art, "homesick-moon");
  assert.equal(quote.artExact, false);
  assert.equal(quote.meaningHeading, "作品译文");
  assert.ok(!("token" in quote));
  assert.ok(!("ipAddress" in quote));
  assert.ok(quote.source.startsWith("https://zh.wikisource.org/"));
});
test("exact online match reuses dedicated illustration and existing interpretation", () => {
  const local = QUOTES.find((q) => q.id === "winter-river");
  const quote = normalizeOnline(
    fixture({
      id: "snow",
      content: local.lines.join("，") + "。",
      origin: {
        title: local.title,
        author: local.author,
        dynasty: local.dynasty,
        content: local.fullText.split("\n"),
        translate: null,
      },
    }),
    context,
  );
  assert.equal(quote.art, local.art);
  assert.ok(quote.artExact);
  assert.equal(quote.meaning, local.meaning);
  assert.equal(quote.meaningHeading, "句意");
});
test("missing translations remain empty and never inherit an unrelated poem explanation", () => {
  const quote = normalizeOnline(
    fixture({ origin: { ...fixture().data.origin, translate: null } }),
    context,
  );
  assert.equal(quote.meaning, "");
  assert.equal(quote.appreciation, "");
});
test("invalid, oversized and unrelated original responses are rejected", () => {
  for (const payload of [
    { status: "error" },
    fixture({ content: "" }),
    fixture({ origin: { title: "秋思" } }),
    fixture({ id: "../invalid" }),
    fixture({ content: "无关的诗句" }),
  ])
    assert.throws(() => normalizeOnline(payload, context));
  const quote = normalizeOnline(
    fixture({ matchTags: ["秋", null, 5] }),
    context,
  );
  assert.deepEqual(quote.tags, ["秋"]);
});
test("snapshots rebuild safe source links and whitelist illustration names", () => {
  const quote = normalizeOnline(fixture(), context);
  assert.equal(
    restoreOnline({ ...quote, source: "javascript:alert(1)" }).source,
    quote.source,
  );
  assert.equal(restoreOnline({ ...quote, art: "../../secret" }), null);
  assert.equal(restoreOnline({ ...quote, id: "__proto__" }), null);
  assert.equal(resolveFavorite("spring-dawn").id, "spring-dawn");
  assert.equal(
    resolveFavorite(quote.id, { [quote.id]: quote }).content,
    quote.content,
  );
});
test("semantic matching gives snow, desert and lotus precedence over the current season", () => {
  assert.ok(
    ["winter-river", "winter-blossom"].includes(matchArt("寒江雪", context)),
  );
  assert.equal(matchArt("大漠孤烟直", context), "desert");
  assert.equal(matchArt("荷花映日", context), "summer-lotus");
});
test("client persists and reuses anonymous marker in header, without exposing it to UI", async () => {
  let clock = 10000;
  const store = memory();
  const calls = [];
  const client = createOnlineClient(store, {
    now: () => clock,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response(fixture());
    },
  });
  const first = await client.get(context);
  assert.equal(first.status, "online");
  assert.equal(calls[0].url, API_URL);
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(store.data.onlineToken, "test-marker");
  clock += 6000;
  await client.get(context);
  assert.equal(calls[1].options.headers["X-User-Token"], "test-marker");
  assert.ok(!calls[1].url.includes("test-marker"));
  assert.ok(!JSON.stringify(first).includes("test-marker"));
});
test("concurrent requests share one fetch and short-lived cache limits request frequency", async () => {
  const store = memory();
  let calls = 0;
  const client = createOnlineClient(store, {
    fetchImpl: async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return response(fixture());
    },
  });
  const [a, b] = await Promise.all([client.get(context), client.get(context)]);
  assert.equal(calls, 1);
  assert.equal(a.quote.id, b.quote.id);
  assert.equal((await client.get(context)).status, "cached");
  assert.equal(calls, 1);
});
test("timeouts, HTTP failures, malformed JSON and API errors back off rather than repeatedly retrying", async () => {
  const failures = [
    async () => new Response("", { status: 503 }),
    async () => new Response("bad json"),
    async () => response({ status: "error" }),
    async (_, { signal }) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        }),
      ),
    async () => new Response("x".repeat(262145)),
  ];
  for (const fetchImpl of failures) {
    const store = memory();
    let calls = 0;
    const client = createOnlineClient(store, {
      timeout: 10,
      fetchImpl: async (...args) => {
        calls++;
        return fetchImpl(...args);
      },
    });
    assert.equal((await client.get(context)).status, "unavailable");
    assert.equal((await client.get(context)).status, "unavailable");
    assert.equal(calls, 1);
  }
});
test("online disabled or preview mode performs no network requests", async () => {
  for (const [settings, allowOnline] of [
    [{ onlineEnabled: false }, true],
    [{}, false],
  ]) {
    let called = false;
    const store = memory({ settings });
    const controller = createStateController(store, {
      allowOnline,
      onlineClient: {
        async get() {
          called = true;
          throw new Error("unexpected");
        },
      },
    });
    const result = await controller.handle({ type: "select" });
    assert.equal(result.source, "offline");
    assert.equal(called, false);
  }
});
test("controller selects online first; repeating API response and outage use compatible offline content", async () => {
  const store = memory();
  let mode = "online";
  const quote = normalizeOnline(fixture(), context);
  const controller = createStateController(store, {
    date: () => new Date(2026, 9, 14, 12),
    onlineClient: {
      async get() {
        return mode === "online"
          ? { status: "online", quote }
          : { status: "unavailable" };
      },
    },
  });
  const first = await controller.handle({ type: "select" });
  assert.equal(first.source, "online");
  const second = await controller.handle({
    type: "select",
    currentId: first.quote.id,
  });
  assert.equal(second.source, "offline");
  assert.equal(second.status, "repeat");
  mode = "error";
  const third = await controller.handle({
    type: "select",
    currentId: second.quote.id,
  });
  assert.equal(third.source, "offline");
  assert.equal(third.status, "unavailable");
  assert.notEqual(second.quote.id, third.quote.id);
});
test("existing offline favorites migrate intact and online favorites retain removable snapshots", async () => {
  const quote = normalizeOnline(fixture(), context);
  const store = memory({ favorites: ["spring-dawn"] });
  const controller = createStateController(store);
  let result = await controller.handle({
    type: "favorite",
    id: quote.id,
    quote,
  });
  assert.deepEqual(result.favorites, ["spring-dawn", quote.id]);
  assert.equal(
    resolveFavorite(quote.id, result.favoriteSnapshots).content,
    quote.content,
  );
  result = await controller.handle({ type: "favorite", id: quote.id });
  assert.deepEqual(result.favorites, ["spring-dawn"]);
  assert.ok(!result.favoriteSnapshots[quote.id]);
});
test("concurrent offline and online favorites retain both writes", async () => {
  const quote = normalizeOnline(fixture(), context);
  const store = memory();
  const controller = createStateController(store);
  await Promise.all([
    controller.handle({ type: "favorite", id: "spring-dawn" }),
    controller.handle({ type: "favorite", id: quote.id, quote }),
  ]);
  assert.deepEqual(store.data.favorites, ["spring-dawn", quote.id]);
});
test("turning online off during an in-flight request prevents late online replacement", async () => {
  const store = memory();
  const quote = normalizeOnline(fixture(), context);
  let complete;
  const controller = createStateController(store, {
    onlineClient: {
      get: () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    },
  });
  const pending = controller.handle({ type: "select" });
  await new Promise((r) => setTimeout(r, 0));
  await store.set("settings", { onlineEnabled: false });
  complete({ status: "online", quote });
  assert.equal((await pending).source, "offline");
});
