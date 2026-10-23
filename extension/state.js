import { createProviderClient } from "./provider-client.js";
import { restoreCustom } from "./custom.js";
import { selectServiceQuote } from "./service-client.js";
import { QUOTES } from "./quotes.js";
import { getContext, selectQuote, scoreQuote } from "./context.js";
import { sanitizeSettings } from "./storage.js";
import { restoreOnline, resolveFavorite } from "./online.js";

function backgroundSources(quotes = []) {
  return [...new Set(quotes.map((quote) =>
    quote.media?.type === "video" ? quote.media.posterUrl : quote.media?.url,
  ).filter(Boolean))].slice(0, 10);
}

export function createStateController(
  storage,
  {
    allowOnline = true,
    onlineClient = createProviderClient(storage),
    date = () => new Date(),
    random = Math.random,
  } = {},
) {
  let pending = Promise.resolve();
  const serialized = (fn) => {
    const task = pending.catch(() => {}).then(fn);
    pending = task;
    return task;
  };
  return {
    async handle(message) {
      if (message.type === "load") {
        const settings = sanitizeSettings(await storage.get("settings", {}));
        if (!allowOnline || !settings.onlineEnabled) return { status: "disabled" };
        const result = await onlineClient.load(message.id, settings);
        if (!result.quote) return result;
        return serialized(async () => {
          const latest = sanitizeSettings(await storage.get("settings", {}));
          if (!latest.onlineEnabled) return { status: "disabled" };
          if (latest.serviceUrl !== settings.serviceUrl || latest.mediaPreference !== settings.mediaPreference)
            return { status: "changed" };
          const raw = await storage.get("history", []);
          const history = Array.isArray(raw) ? raw.filter((id) => typeof id === "string") : [];
          await storage.set("history", [...history, result.quote.id].slice(-24));
          return { ...result, context: getContext(date(), latest.hemisphere), source: "specified", prefetch: [] };
        });
      }
      if (message.type === "select") {
        const settings = sanitizeSettings(await storage.get("settings", {}));
        const context = getContext(date(), settings.hemisphere);
        let result = { status: "disabled" };
        if (allowOnline && settings.onlineEnabled && !message.preferOffline) {
          try {
            result = await onlineClient.get(context, settings, {
              currentId: message.currentId,
              history: await storage.get("history", []),
              cacheOnly: message.cacheOnly === true,
              refresh: message.replaceCached === true,
            });
          } catch {
            result = { status: "unavailable" };
          }
        }
        return serialized(async () => {
          const latest = sanitizeSettings(await storage.get("settings", {}));
          const currentContext = getContext(date(), latest.hemisphere);
          const raw = await storage.get("history", []);
          const history = Array.isArray(raw)
            ? raw.filter((id) => typeof id === "string")
            : [];
          const pool =
            settings.provider === "service" && result.quotes?.length
              ? result.quotes
              : null;
          let quote = pool
            ? selectServiceQuote(pool, history, message.currentId, random)
            : result.quote;
          let source = result.cached ? "cached" : result.status,
            status = result.status;
          const changed =
            latest.provider !== settings.provider ||
            latest.serviceUrl !== settings.serviceUrl ||
            latest.customUrl !== settings.customUrl ||
            latest.mediaPreference !== settings.mediaPreference ||
            latest.hemisphere !== settings.hemisphere ||
            currentContext.season !== context.season ||
            currentContext.period !== context.period ||
            currentContext.term !== context.term;
          if (message.refreshOnly) {
            if (!allowOnline || !latest.onlineEnabled || changed) return null;
            const replacement = message.replaceCached && ["online", "cached"].includes(status) && quote;
            if (replacement)
              await storage.set("history", [...history, quote.id].slice(-24));
            return {
              status,
              prefetch: backgroundSources(pool || (quote ? [quote] : [])),
              ...(replacement
                ? { quote, context: currentContext, source }
                : {}),
            };
          }
          const cachedInitial = message.cacheOnly && message.initial;
          const repeated = !pool && !cachedInitial && quote &&
            (quote.id === message.currentId || history.slice(-6).includes(quote.id));
          if (message.cacheOnly &&
            (!allowOnline || !quote || !latest.onlineEnabled || changed || repeated)) return null;
          if (
            !quote ||
            !latest.onlineEnabled ||
            changed ||
            repeated
          ) {
            if (quote && latest.onlineEnabled && !changed) status = "repeat";
            if (!latest.onlineEnabled || message.preferOffline || !allowOnline)
              status = "disabled";
            const initial = message.initial
              ? QUOTES.find((q) => q.id === message.currentId)
              : null;
            quote =
              initial &&
              scoreQuote(initial, currentContext) > 0 &&
              !history.slice(-6).includes(initial.id)
                ? initial
                : selectQuote(
                    QUOTES,
                    currentContext,
                    history,
                    random,
                    message.initial ? null : message.currentId,
                  );
            source = "offline";
          }
          await storage.set("history", [...history, quote.id].slice(-24));
          return {
            quote,
            quoteId: quote.id,
            context: currentContext,
            source,
            status,
            prefetch: backgroundSources(!changed && latest.onlineEnabled && source !== "offline" ? pool || [] : []).filter((src) =>
              src !== (quote.media?.type === "video" ? quote.media.posterUrl : quote.media?.url),
            ),
          };
        });
      }
      if (message.type === "favorite") {
        return serialized(async () => {
          const rawSnapshots = await storage.get("favoriteSnapshots", {});
          const snapshots =
            rawSnapshots &&
            typeof rawSnapshots === "object" &&
            !Array.isArray(rawSnapshots)
              ? { ...rawSnapshots }
              : {};
          const incoming =
            restoreOnline(message.quote) || restoreCustom(message.quote);
          const quote =
            QUOTES.find((q) => q.id === message.id) ||
            incoming ||
            resolveFavorite(message.id, snapshots);
          if (!quote || quote.id !== message.id)
            throw new Error("Unknown quote");
          const raw = await storage.get("favorites", []);
          const ids = Array.isArray(raw)
            ? raw.filter((id) => resolveFavorite(id, snapshots))
            : [];
          let favorites;
          if (ids.includes(message.id)) {
            favorites = ids.filter((id) => id !== message.id);
            delete snapshots[message.id];
          } else {
            favorites = [...new Set([...ids, message.id])];
            if (["online", "custom"].includes(quote.provider))
              snapshots[message.id] = quote;
          }
          // Write both fields together so another tab never sees an ID without its content.
          await storage.setMany({ favorites, favoriteSnapshots: snapshots });
          return { favorites, favoriteSnapshots: snapshots };
        });
      }
      throw new Error("Unknown request");
    },
  };
}
