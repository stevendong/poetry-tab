import { SERVICE_URL, httpUrl } from "./custom.js";
export const DEFAULT_SETTINGS = {
  language: "auto",
  onlineEnabled: true,
  provider: "service",
  serviceUrl: SERVICE_URL,
  customUrl: "",
  mediaPreference: "image",
  hemisphere: "north",
  showClock: true,
  showMeaning: false,
  poemFont: "brush",
  textSize: "normal",
  shade: 35,
};
export function sanitizeSettings(value = {}) {
  value = value && typeof value === "object" ? value : {};
  return {
    language: ["en", "zh", "zh-TW"].includes(value.language)
      ? value.language
      : "auto",
    provider: ["service", "custom", "jinrishici"].includes(value.provider)
      ? value.provider
      : DEFAULT_SETTINGS.provider,
    serviceUrl: httpUrl(value.serviceUrl) || SERVICE_URL,
    customUrl: httpUrl(value.customUrl) || "",
    mediaPreference: value.mediaPreference === "video" ? "video" : "image",
    onlineEnabled:
      typeof value.onlineEnabled === "boolean" ? value.onlineEnabled : true,
    hemisphere: value.hemisphere === "south" ? "south" : "north",
    showClock: typeof value.showClock === "boolean" ? value.showClock : true,
    showMeaning:
      typeof value.showMeaning === "boolean" ? value.showMeaning : false,
    poemFont: ["brush", "serif", "sans"].includes(value.poemFont)
      ? value.poemFont
      : DEFAULT_SETTINGS.poemFont,
    textSize: value.textSize === "large" ? "large" : "normal",
    shade: Number.isFinite(value.shade)
      ? Math.min(70, Math.max(15, value.shade))
      : 35,
  };
}
export const storage = {
  async get(key, fallback) {
    if (globalThis.chrome?.storage?.local) {
      const result = await chrome.storage.local.get(key);
      return result[key] ?? fallback;
    }
    const raw = localStorage.getItem(`yijian:${key}`);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  async setMany(values) {
    if (globalThis.chrome?.storage?.local)
      await chrome.storage.local.set(values);
    else
      for (const [key, value] of Object.entries(values))
        localStorage.setItem(`yijian:${key}`, JSON.stringify(value));
  },
  async set(key, value) {
    if (globalThis.chrome?.storage?.local)
      await chrome.storage.local.set({ [key]: value });
    else localStorage.setItem(`yijian:${key}`, JSON.stringify(value));
  },
};
