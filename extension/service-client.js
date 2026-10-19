import {
  endpointFor,
  customRequest,
  normalizeCustom,
  restoreCustom,
  readJson,
  retryAfterMs,
} from "./custom.js";

export function candidatesRequest(settings, context) {
  const url = new URL(customRequest(settings, context));
  url.pathname = url.pathname.replace(/\/recommendation$/, "/candidates");
  url.searchParams.delete("exclude");
  url.searchParams.set("limit", "10");
  return url.href;
}

export function selectServiceQuote(
  items,
  history,
  currentId,
  random = Math.random,
) {
  const alternatives = items.filter((q) => q.id !== currentId);
  const pool = alternatives.length ? alternatives : items;
  const recent = history.slice(-6);
  let choices = pool.filter((q) => !recent.includes(q.id));
  if (!choices.length) {
    const oldest = Math.min(...pool.map((q) => history.lastIndexOf(q.id)));
    choices = pool.filter((q) => history.lastIndexOf(q.id) === oldest);
  }
  return choices[
    Math.min(choices.length - 1, Math.floor(random() * choices.length))
  ];
}

export function createServiceClient(
  storage,
  { fetchImpl, now, timeout, hasPermission },
) {
  const flights = new Map();
  return {
    async get(context, settings, { cacheOnly = false } = {}) {
      let endpoint;
      try {
        endpoint = endpointFor(settings);
      } catch {
        return { status: "unavailable" };
      }
      if (!(await hasPermission(endpoint))) return { status: "permission" };
      const key = JSON.stringify([
        endpoint,
        settings.mediaPreference,
        context.season,
        context.period,
        context.hemisphere,
        context.term,
      ]);
      // Startup reads must not wait behind a refresh already using the network.
      if (!cacheOnly && flights.has(key)) return flights.get(key);
      const load = async () => {
        const state = await storage.get("servicePoolState", {});
        const same = state?.key === key;
        const age = same ? now() - state.fetchedAt : Infinity;
        const items =
          same && Array.isArray(state.items)
            ? state.items
                .slice(0, 10)
                .map(restoreCustom)
                .filter(
                  (q) =>
                    q?.endpoint === endpoint && q.apiProvider === "service",
                )
            : [];
        const stale = age >= 0 && age < 600000 ? items : [];
        if (cacheOnly)
          return {
            status: same && state.retryAt > now() ? state.failure || "unavailable" : "cached",
            quotes: stale,
            cached: stale.length > 0,
          };
        if (same && state.retryAt > now())
          return {
            status: state.failure || "unavailable",
            quotes: stale,
            cached: stale.length > 0,
            retryAt: state.retryAt,
          };
        if (items.length && age >= 0 && age < 60000)
          return { status: "cached", quotes: items, cached: true };
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
          const response = await fetchImpl(
            candidatesRequest(settings, context),
            {
              signal: controller.signal,
              credentials: "omit",
              cache: "no-store",
              redirect: "error",
              referrerPolicy: "no-referrer",
            },
          );
          const data = await readJson(response, 1048576);
          if (!Array.isArray(data?.items))
            throw new Error("Invalid candidates");
          const quotes = data.items.slice(0, 10).map((q) => {
            const preferred =
              Array.isArray(q.media) &&
              q.media.find(
                (m) =>
                  m.active !== false &&
                  m.type === (settings.mediaPreference || "image") &&
                  (m.type === "image" || m.posterUrl),
              );
            return normalizeCustom(
              { quote: { ...q, background: preferred || q.background } },
              settings,
            );
          });
          await storage.set("servicePoolState", {
            key,
            items: quotes,
            fetchedAt: now(),
            retryAt: quotes.length ? 0 : now() + 60000,
            failure: quotes.length ? null : "empty",
          });
          return { status: quotes.length ? "online" : "empty", quotes };
        } catch (error) {
          const status = error.status === 429 ? "rate_limited" : "unavailable";
          const retryAt =
            now() +
            (error.status === 429
              ? retryAfterMs(error.retryAfter, now())
              : 60000);
          await storage.set("servicePoolState", {
            key,
            items,
            fetchedAt: same ? state.fetchedAt : 0,
            failure: status,
            retryAt,
          });
          return { status, quotes: stale, cached: stale.length > 0, retryAt };
        } finally {
          clearTimeout(timer);
        }
      };
      if (cacheOnly) return load();
      const flight = load();
      flights.set(key, flight);
      try {
        return await flight;
      } finally {
        flights.delete(key);
      }
    },
  };
}
