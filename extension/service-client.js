import {
  endpointFor,
  httpUrl,
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

export function validQuotationId(id) {
  return typeof id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
}

export function quotationRequest(settings, id) {
  if (!validQuotationId(id)) throw new Error("Invalid quotation ID");
  const url = new URL(endpointFor({ ...settings, provider: "service" }));
  url.pathname = url.pathname.replace(/\/recommendation$/, `/quotations/${id}`);
  for (const key of ["season", "period", "term", "prefer", "exclude", "limit"])
    url.searchParams.delete(key);
  return url.href;
}

function normalizeServiceQuote(quote, settings) {
  const endpoint = endpointFor(settings);
  const available = (Array.isArray(quote.media) ? quote.media : []).filter((media) =>
    media && media.active !== false && httpUrl(media.url, endpoint),
  );
  const image = [quote.background, ...available].find((media) =>
    media?.active !== false && media?.type === "image" && httpUrl(media.url, endpoint),
  );
  // Use the quotation's returned image as the video poster whenever available.
  const withPoster = (media) => media?.type === "video"
    ? { ...media, posterUrl: image?.url || httpUrl(media.posterUrl, endpoint) }
    : media;
  const preferred = available.map(withPoster).find((media) =>
    media.type === (settings.mediaPreference || "image") &&
    (media.type === "image" || media.posterUrl),
  );
  return normalizeCustom({ quote: { ...quote, background: preferred || withPoster(quote.background) } }, settings);
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
    async load(id, settings) {
      if (!validQuotationId(id)) return { status: "invalid_id" };
      const config = { ...settings, provider: "service" };
      let url;
      try {
        url = quotationRequest(config, id);
      } catch {
        return { status: "invalid_url" };
      }
      if (!(await hasPermission(url))) return { status: "permission" };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetchImpl(url, {
          signal: controller.signal, credentials: "omit", cache: "no-store",
          redirect: "error", referrerPolicy: "no-referrer",
        });
        const data = await readJson(response);
        const quote = data?.quote ?? data?.data ?? data;
        if (quote?.id !== id) return { status: "invalid_response" };
        if (quote.status !== "published" || quote.ready !== true) return { status: "not_found" };
        return { status: "loaded", quote: normalizeServiceQuote(quote, config) };
      } catch (error) {
        return { status: error.status === 404 ? "not_found" :
          error.status === 429 ? "rate_limited" : "unavailable" };
      } finally {
        clearTimeout(timer);
      }
    },
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
          const quotes = data.items.slice(0, 10).map((quote) => normalizeServiceQuote(quote, settings));
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
