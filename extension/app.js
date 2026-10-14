import { QUOTES } from "./quotes.js";
import { getContext, SEASONS, selectQuote, matchingReason } from "./context.js";
import { storage, sanitizeSettings, DEFAULT_SETTINGS } from "./storage.js";

const $ = (id) => document.getElementById(id);
let settings = { ...DEFAULT_SETTINGS };
let favorites = [];
let current = null;
let context = getContext();
let busy = false;
let favoriteBusy = false;
let renderVersion = 0;
let toastTimer;
let settingsWrites = Promise.resolve();

function toast(message) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").hidden = false;
  toastTimer = setTimeout(() => {
    $("toast").hidden = true;
  }, 3300);
}

async function request(message) {
  if (globalThis.chrome?.runtime?.id) {
    const result = await chrome.runtime.sendMessage(message);
    if (result?.error) throw new Error(result.error);
    if (!result?.data) throw new Error("未收到扩展响应");
    return result.data;
  }
  const act = async () => {
    if (message.type === "select") {
      const savedSettings = sanitizeSettings(await storage.get("settings", {}));
      const context = getContext(new Date(), savedSettings.hemisphere);
      const rawHistory = await storage.get("history", []);
      const history = Array.isArray(rawHistory) ? rawHistory : [];
      const quote = selectQuote(
        QUOTES,
        context,
        history,
        Math.random,
        message.currentId,
      );
      await storage.set("history", [...history, quote.id].slice(-24));
      return { quoteId: quote.id, context };
    }
    if (message.type === "favorite") {
      const raw = await storage.get("favorites", []);
      const ids = Array.isArray(raw)
        ? raw.filter((id) => QUOTES.some((q) => q.id === id))
        : [];
      const favorites = ids.includes(message.id)
        ? ids.filter((id) => id !== message.id)
        : [...new Set([...ids, message.id])];
      await storage.set("favorites", favorites);
      return { favorites };
    }
    throw new Error("Unknown request");
  };
  return navigator.locks ? navigator.locks.request("yijian-state", act) : act();
}

function updateClock() {
  const now = new Date();
  context = getContext(now, settings.hemisphere);
  $("clock").textContent = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  $("clock").dateTime = now.toISOString();
  $("date-label").textContent = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(now);
  $("season-label").textContent =
    `${SEASONS[context.season]}日${settings.hemisphere === "south" ? " · 南半球" : ""}`;
  $("term-label").textContent = context.term;
}

function applySettings() {
  document.documentElement.style.setProperty(
    "--shade",
    String(settings.shade / 100),
  );
  document.body.classList.toggle("large-text", settings.textSize === "large");
  $("clock-wrap").hidden = !settings.showClock;
  $("inline-meaning").hidden = !settings.showMeaning;
  $("hemisphere").value = settings.hemisphere;
  $("show-clock").checked = settings.showClock;
  $("show-meaning").checked = settings.showMeaning;
  $("text-size").value = settings.textSize;
  $("shade").value = settings.shade;
  updateClock();
}

function updateFavorite() {
  const saved = current && favorites.includes(current.id);
  $("favorite-button").setAttribute("aria-pressed", String(Boolean(saved)));
  $("favorite-button").setAttribute(
    "aria-label",
    saved ? "取消收藏这句" : "收藏这句",
  );
  $("favorite-button").title = saved ? "取消收藏这句" : "收藏这句";
  $("favorite-label").textContent = saved ? "已收藏" : "收藏";
}

async function displayQuote(quote, fromLibrary = false) {
  const version = ++renderVersion;
  current = quote;
  const nodes = quote.lines.map((line) => {
    const span = document.createElement("span");
    span.textContent = line;
    return span;
  });
  $("verse").replaceChildren(...nodes);
  $("byline").textContent =
    `${quote.dynasty} · ${quote.author}  /  《${quote.title}》`;
  $("reason").textContent = fromLibrary
    ? "收藏中的一笺"
    : matchingReason(quote, context);
  $("inline-meaning").textContent = quote.meaning;
  document.title = `${quote.lines.join("，")} · 一笺`;
  updateFavorite();
  populateReading();
  const src = `assets/art/${quote.art}.webp`;
  if ($("art").getAttribute("src") === src) return;
  const image = new Image();
  image.src = src;
  try {
    await image.decode();
    if (version !== renderVersion) return;
    $("art").src = src;
    $("art").classList.add("loaded");
    document.body.dataset.quote = quote.id;
  } catch {
    if (version !== renderVersion) return;
    $("art").removeAttribute("src");
    $("art").classList.remove("loaded");
    toast("插画暂时未能载入，请检查扩展文件是否完整");
  }
}

async function nextQuote() {
  if (busy) return;
  busy = true;
  $("next-button").disabled = true;
  $("poetry").setAttribute("aria-busy", "true");
  try {
    const result = await request({ type: "select", currentId: current?.id });
    context = result.context;
    const quote = QUOTES.find((q) => q.id === result.quoteId);
    if (!quote) throw new Error("Unknown quote");
    await displayQuote(quote);
  } catch (error) {
    console.error("Selection failed:", error.message);
    // Still show context-appropriate content if persistent storage is unavailable.
    context = getContext(new Date(), settings.hemisphere);
    await displayQuote(
      selectQuote(QUOTES, context, [], Math.random, current?.id),
    );
    toast("本地存储暂不可用，当前诗句仍可阅读");
  } finally {
    busy = false;
    $("next-button").disabled = false;
    $("poetry").setAttribute("aria-busy", "false");
  }
}

function populateReading() {
  if (!current) return;
  $("reading-title").textContent = current.title;
  $("reading-byline").textContent =
    `${current.dynasty} · ${current.author} · ${current.kind}`;
  $("reading-verse").textContent = current.lines.join("，") + "。";
  $("meaning").textContent = current.meaning;
  $("appreciation").textContent = current.appreciation;
  $("fulltext").textContent = current.fullText;
  $("fulltext-label").textContent = current.excerpt ? "原文节选" : "原文";
  $("source-link").href = current.source;
}

function openDialog(id) {
  const dialog = $(id);
  if (!dialog.open) dialog.showModal();
}

function populateLibrary() {
  const saved = favorites
    .map((id) => QUOTES.find((q) => q.id === id))
    .filter(Boolean)
    .reverse();
  $("library-count").textContent = `共 ${saved.length} 笺`;
  if (!saved.length) {
    const p = document.createElement("p");
    p.className = "empty-library";
    p.textContent = "还没有收藏。遇到喜欢的句子，\n点一下心，就能把它留下。";
    $("library-list").replaceChildren(p);
    return;
  }
  $("library-list").replaceChildren(
    ...saved.map((quote) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "saved-quote";
      const text = document.createElement("span");
      const strong = document.createElement("strong");
      strong.textContent = quote.lines.join("，");
      const small = document.createElement("small");
      small.textContent = `${quote.author} · ${quote.title}`;
      text.append(strong, small);
      const arrow = document.createElement("span");
      arrow.textContent = "↗";
      arrow.setAttribute("aria-hidden", "true");
      button.append(text, arrow);
      button.addEventListener("click", async () => {
        $("library-dialog").close();
        await displayQuote(quote, true);
      });
      return button;
    }),
  );
}

$("next-button").addEventListener("click", nextQuote);
$("favorite-button").addEventListener("click", async () => {
  if (!current || favoriteBusy) return;
  favoriteBusy = true;
  $("favorite-button").disabled = true;
  const id = current.id;
  try {
    const result = await request({ type: "favorite", id });
    favorites = result.favorites;
    updateFavorite();
    toast(favorites.includes(id) ? "已收入收藏册" : "已取消收藏");
  } catch {
    toast("收藏未能保存，请稍后重试");
  } finally {
    favoriteBusy = false;
    $("favorite-button").disabled = false;
  }
});
$("read-button").addEventListener("click", () => {
  if (current) openDialog("reading-dialog");
});
$("library-button").addEventListener("click", () => {
  populateLibrary();
  openDialog("library-dialog");
});
$("settings-button").addEventListener("click", () =>
  openDialog("settings-dialog"),
);
document
  .querySelectorAll("[data-close]")
  .forEach((button) =>
    button.addEventListener("click", () => button.closest("dialog").close()),
  );
document.querySelectorAll("dialog").forEach((dialog) => {
  // Compare coordinates rather than target: clicks in dialog padding target the dialog too.
  dialog.addEventListener("click", (event) => {
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      dialog.close();
  });
});
$("settings-form").addEventListener("submit", (event) =>
  event.preventDefault(),
);
$("settings-form").addEventListener("change", () => {
  const oldHemisphere = settings.hemisphere;
  settings = sanitizeSettings({
    hemisphere: $("hemisphere").value,
    showClock: $("show-clock").checked,
    showMeaning: $("show-meaning").checked,
    textSize: $("text-size").value,
    shade: Number($("shade").value),
  });
  applySettings();
  const snapshot = { ...settings };
  settingsWrites = settingsWrites
    .catch(() => {})
    .then(async () => {
      try {
        await storage.set("settings", snapshot);
        if (oldHemisphere !== snapshot.hemisphere) await nextQuote();
      } catch {
        toast("设置未能保存，请稍后重试");
      }
    });
});
$("shade").addEventListener("input", () =>
  document.documentElement.style.setProperty(
    "--shade",
    String(Number($("shade").value) / 100),
  ),
);
document.addEventListener("keydown", (event) => {
  if (
    event.code !== "Space" ||
    event.repeat ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    document.querySelector("dialog[open]")
  )
    return;
  if (
    event.target.closest(
      "button, a, input, select, textarea, [contenteditable]",
    )
  )
    return;
  event.preventDefault();
  nextQuote();
});

function storageChanged(changes) {
  if (changes.favorites) {
    const value = changes.favorites.newValue;
    favorites = Array.isArray(value)
      ? value.filter((id) => QUOTES.some((q) => q.id === id))
      : [];
    updateFavorite();
    if ($("library-dialog").open) populateLibrary();
  }
  if (changes.settings) {
    settings = sanitizeSettings(changes.settings.newValue);
    applySettings();
  }
}
if (globalThis.chrome?.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") storageChanged(changes);
  });
} else {
  addEventListener("storage", (event) => {
    if (!event.key?.startsWith("yijian:")) return;
    try {
      storageChanged({
        [event.key.slice(7)]: {
          newValue: event.newValue ? JSON.parse(event.newValue) : undefined,
        },
      });
    } catch {
      /* Ignore malformed data in another tab. */
    }
  });
}

async function init() {
  try {
    const [savedSettings, savedFavorites] = await Promise.all([
      storage.get("settings", {}),
      storage.get("favorites", []),
    ]);
    settings = sanitizeSettings(savedSettings);
    favorites = Array.isArray(savedFavorites)
      ? savedFavorites.filter((id) => QUOTES.some((q) => q.id === id))
      : [];
  } catch {
    toast("本地数据暂时未能读取");
  }
  applySettings();
  await nextQuote();
  setInterval(updateClock, 15000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) updateClock();
  });
}
init();
