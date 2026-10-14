import { QUOTES } from "./quotes.js";
import { getContext, selectQuote, scoreQuote } from "./context.js";
import { sanitizeSettings } from "./storage.js";
import {
  createOnlineClient,
  restoreOnline,
  resolveFavorite,
} from "./online.js";

export function createStateController(
  storage,
  {
    allowOnline = true,
    onlineClient = createOnlineClient(storage),
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
      if (message.type === "select") {
        const settings = sanitizeSettings(await storage.get("settings", {}));
        const context = getContext(date(), settings.hemisphere);
        let result = { status: "disabled" };
        if (allowOnline && settings.onlineEnabled && !message.preferOffline) {
          try {
            result = await onlineClient.get(context);
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
          let quote = result.quote;
          let source = result.status,
            status = result.status;
          const changed =
            latest.hemisphere !== settings.hemisphere ||
            currentContext.season !== context.season ||
            currentContext.period !== context.period;
          if (
            !quote ||
            !latest.onlineEnabled ||
            changed ||
            quote.id === message.currentId ||
            history.slice(-6).includes(quote.id)
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
                    message.currentId,
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
          const incoming = restoreOnline(message.quote);
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
            if (quote.provider === "online") snapshots[message.id] = quote;
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
