import { QUOTES } from "./quotes.js";
import { getContext, selectQuote } from "./context.js";
import { sanitizeSettings } from "./storage.js";

let pending = Promise.resolve();
async function handle(message) {
  if (message.type === "select") {
    const { settings, history } = await chrome.storage.local.get([
      "settings",
      "history",
    ]);
    const context = getContext(
      new Date(),
      sanitizeSettings(settings).hemisphere,
    );
    const recent = Array.isArray(history)
      ? history.filter((id) => typeof id === "string")
      : [];
    const quote = selectQuote(
      QUOTES,
      context,
      recent,
      Math.random,
      message.currentId,
    );
    await chrome.storage.local.set({
      history: [...recent, quote.id].slice(-24),
    });
    return { quoteId: quote.id, context };
  }
  if (message.type === "favorite") {
    if (!QUOTES.some((q) => q.id === message.id))
      throw new Error("Unknown quote");
    const result = await chrome.storage.local.get("favorites");
    const ids = Array.isArray(result.favorites)
      ? result.favorites.filter((id) => QUOTES.some((q) => q.id === id))
      : [];
    const favorites = ids.includes(message.id)
      ? ids.filter((id) => id !== message.id)
      : [...new Set([...ids, message.id])];
    await chrome.storage.local.set({ favorites });
    return { favorites };
  }
  throw new Error("Unknown request");
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  pending = pending.catch(() => {}).then(() => handle(message));
  pending.then(
    (data) => respond({ data }),
    (error) => respond({ error: error.message }),
  );
  return true;
});
