import { createOnlineClient } from "./online.js";
import {
  endpointFor,
  originPattern,
  normalizeCustom,
  restoreCustom,
  customRequest,
  readJson,
} from "./custom.js";

export function createProviderClient(
  storage,
  {
    fetchImpl = (...args) => globalThis.fetch(...args),
    now = Date.now,
    timeout = 4000,
    hasPermission = async (endpoint) =>
      globalThis.chrome?.permissions
        ? chrome.permissions.contains({ origins: [originPattern(endpoint)] })
        : true,
  } = {},
) {
  const jinrishici = createOnlineClient(storage, { fetchImpl, now, timeout });
  const flights = new Map();
  return {
    async get(context, settings, { currentId, history = [] } = {}) {
      if (settings.provider === "jinrishici") return jinrishici.get(context);
      let endpoint;
      try {
        endpoint = endpointFor(settings);
      } catch {
        return { status: "unavailable" };
      }
      if (!(await hasPermission(endpoint))) return { status: "permission" };
      const configKey = JSON.stringify([
        endpoint,
        settings.provider,
        settings.mediaPreference,
      ]);
      const contextKey = JSON.stringify([
        context.season,
        context.period,
        context.hemisphere,
        context.term,
      ]);
      const flightKey = configKey + contextKey;
      if (flights.has(flightKey)) return flights.get(flightKey);
      const run = async () => {
        const state = await storage.get("customOnlineState", {});
        const same = state?.configKey === configKey;
        const last = same ? restoreCustom(state.quote) : null;
        if (same && state.retryAt > now()) return { status: "unavailable" };
        const recent = [
          ...(Array.isArray(history) ? history.slice(-6) : []),
          currentId,
        ].filter(Boolean);
        if (
          last &&
          !recent.includes(last.id) &&
          state.contextKey === contextKey &&
          now() - state.fetchedAt >= 0 &&
          now() - state.fetchedAt < 5000
        )
          return { status: "cached", quote: last };
        const remembered =
          same && Array.isArray(state.recent)
            ? state.recent
            : last
              ? [{ id: last.id, remoteId: last.remoteId }]
              : [];
        const exclusions = remembered
          .filter(
            (q) =>
              recent.includes(q.id) &&
              /^[a-zA-Z0-9_-]{1,100}$/.test(q.remoteId),
          )
          .map((q) => q.remoteId);
        const controller = new AbortController(),
          timer = setTimeout(() => controller.abort(), timeout);
        try {
          const response = await fetchImpl(
            customRequest(settings, context, exclusions),
            {
              signal: controller.signal,
              credentials: "omit",
              cache: "no-store",
              redirect: "error",
              referrerPolicy: "no-referrer",
            },
          );
          const quote = normalizeCustom(await readJson(response), settings);
          await storage.set("customOnlineState", {
            configKey,
            contextKey,
            quote,
            recent: [
              ...remembered.filter((q) => q.id !== quote.id),
              { id: quote.id, remoteId: quote.remoteId },
            ].slice(-6),
            fetchedAt: now(),
            retryAt: 0,
          });
          return { status: "online", quote };
        } catch {
          await storage.set("customOnlineState", {
            configKey,
            contextKey,
            quote: last,
            recent: remembered,
            fetchedAt: state?.fetchedAt || 0,
            retryAt: now() + 60000,
          });
          return { status: "unavailable" };
        } finally {
          clearTimeout(timer);
        }
      };
      const flight = run();
      flights.set(flightKey, flight);
      try {
        return await flight;
      } finally {
        flights.delete(flightKey);
      }
    },
  };
}
