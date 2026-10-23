import { QUOTES } from "./quotes.js";
import { restoreCustom } from "./custom.js";
import { restoreOnline } from "./online.js";

let database;

export function displayConfigKey(settings) {
  return JSON.stringify([
    settings.onlineEnabled, settings.provider, settings.serviceUrl,
    settings.customUrl, settings.mediaPreference, settings.hemisphere,
  ]);
}

function openDatabase() {
  database ||= new Promise((resolve, reject) => {
    const request = indexedDB.open("yijian-display", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("display");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    database = null;
    throw error;
  });
  return database;
}

export function backgroundSource(quote, onlineEnabled) {
  if (quote.provider === "custom" && onlineEnabled && quote.media)
    return quote.media.type === "video" ? quote.media.posterUrl : quote.media.url;
  return quote.art && (quote.provider !== "online" || quote.artExact)
    ? `assets/art/${quote.art}.webp`
    : null;
}

function restoreDisplay(saved, configKey) {
  if (saved?.configKey !== configKey) return null;
  const quote = QUOTES.find((quote) => quote.id === saved.quote?.id) ||
    restoreCustom(saved.quote) || restoreOnline(saved.quote);
  if (!quote || saved.src !== backgroundSource(quote, saved.onlineEnabled)) return null;
  return { ...saved, quote };
}

export async function readLastDisplay(configKey, key = "last") {
  const db = await openDatabase();
  const saved = await new Promise((resolve, reject) => {
    const request = db.transaction("display").objectStore("display").get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return restoreDisplay(saved, configKey);
}

export async function takeNextDisplay(configKey) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("display", "readwrite");
    const store = transaction.objectStore("display");
    const request = store.get("next");
    let snapshot = null;
    let fromNext = false;
    request.onsuccess = () => {
      snapshot = restoreDisplay(request.result, configKey);
      if (snapshot) {
        fromNext = true;
        // Consume and promote together so simultaneous tabs cannot claim the
        // same prepared entry; the last display remains an immediate fallback.
        store.delete("next");
        store.put({ ...snapshot, savedAt: Date.now() }, "last");
      } else {
        const fallback = store.get("last");
        fallback.onsuccess = () => { snapshot = restoreDisplay(fallback.result, configKey); };
      }
    };
    transaction.oncomplete = () => resolve(snapshot ? { ...snapshot, fromNext } : null);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function saveLastDisplay(snapshot, isCurrent, key = "last") {
  // Keep only the current fallback and one prepared poem, with image bytes
  // outside chrome.storage's small JSON quota.
  let imageData = snapshot.imageData || null;
  if (snapshot.src?.startsWith("http") && !imageData) {
    try {
      const response = await fetch(snapshot.src, {
        cache: "force-cache", credentials: "omit", referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error("Image unavailable");
      const blob = await response.blob();
      imageData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      // A successful HTTP response may still contain an invalid image.
      const image = new Image();
      image.src = imageData;
      await image.decode();
    } catch {
      // Cross-origin hosts may allow <img> but deny reading bytes. In that case
      // retain the successful URL and let the browser's HTTP cache serve it.
      imageData = null;
    }
  }
  const db = await openDatabase();
  if (!isCurrent()) return;
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("display", "readwrite");
    const store = transaction.objectStore("display");
    const request = store.get(key);
    request.onsuccess = () => {
      // A slow image copy in an older tab must not overwrite a newer success.
      if (isCurrent() && (request.result?.savedAt || 0) <= snapshot.savedAt)
        store.put({ ...snapshot, imageData }, key);
    };
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
