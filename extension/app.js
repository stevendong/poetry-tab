import { QUOTES } from "./quotes.js";
import { getContext, SEASONS, selectQuote, matchingReason } from "./context.js";
import { storage, sanitizeSettings, DEFAULT_SETTINGS } from "./storage.js";
import { createStateController } from "./state.js";
import { resolveFavorite } from "./online.js";
const previewController = createStateController(storage, {
  allowOnline: false,
});

const $ = (id) => document.getElementById(id);
let settings = { ...DEFAULT_SETTINGS };
let favorites = [];
let favoriteSnapshots = {};
let current = null;
let context = getContext();
let busy = false;
let favoriteBusy = false;
let renderVersion = 0;
let interactionVersion = 0;
let pendingSelection = false;
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
  const act = () => previewController.handle(message);
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
  $("online-enabled").checked = settings.onlineEnabled;
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

async function displayQuote(quote, fromLibrary = false, selection = {}) {
  const version = ++renderVersion;
  current = quote;
  const online = quote.provider === "online";
  document.body.classList.toggle(
    "long-verse",
    quote.lines.some((line) => line.length > 12),
  );
  $("content-source").textContent = online
    ? selection.source === "cached"
      ? "今日诗词 · 最近推荐"
      : "今日诗词 · 在线推荐"
    : selection.status === "unavailable"
      ? "离线精选 · 网络暂不可用"
      : selection.status === "repeat"
        ? "离线精选 · 在线内容暂未更新"
        : "离线精选";
  $("content-source").title =
    online && !quote.artExact
      ? "背景选自已有插画库，与诗句意象或时令匹配"
      : "与诗句对应的 AI 插画";
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
    : online
      ? quote.tags?.join(" · ") || "此刻的诗意"
      : matchingReason(quote, context);
  $("inline-meaning").textContent = quote.meaning
    ? (quote.provider === "online" && quote.meaningHeading === "作品译文"
        ? "作品译文："
        : "") +
      quote.meaning.slice(0, 120) +
      (quote.meaning.length > 120 ? "…" : "")
    : "这首作品暂未提供译文，可展开阅读原文。";
  document.title = `${quote.lines.join("，")} · 一笺`;
  updateFavorite();
  populateReading();
  const src = `assets/art/${quote.art}.webp`;
  if ($("art").getAttribute("src") === src) {
    document.body.dataset.quote = quote.id;
    return;
  }
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

async function nextQuote(options = {}) {
  if (busy) {
    pendingSelection = true;
    return;
  }
  const initial = options.initial === true;
  const interactionAtRequest = interactionVersion;
  const viewAtRequest = renderVersion;
  busy = true;
  $("next-button").disabled = true;
  $("poetry").setAttribute("aria-busy", "true");
  try {
    const result = await request({
      type: "select",
      currentId: current?.id,
      initial,
    });
    context = result.context;
    const quote = result.quote || QUOTES.find((q) => q.id === result.quoteId);
    if (!quote) throw new Error("Unknown quote");
    if (
      interactionVersion === interactionAtRequest &&
      renderVersion === viewAtRequest
    )
      await displayQuote(quote, false, result);
    else if ($("content-source").textContent.includes("正在获取"))
      $("content-source").textContent = "离线精选";
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
    if (pendingSelection) {
      pendingSelection = false;
      void nextQuote();
    }
  }
}

function populateReading() {
  if (!current) return;
  $("reading-title").textContent = current.title;
  $("reading-byline").textContent =
    `${current.dynasty} · ${current.author} · ${current.kind}`;
  $("reading-verse").textContent = current.lines.join("，") + "。";
  $("meaning-heading").textContent = current.meaningHeading || "句意";
  $("meaning").textContent =
    current.meaning || "今日诗词暂未提供这首作品的译文，可结合下方原文阅读。";
  $("appreciation-section").hidden = !current.appreciation;
  $("appreciation").textContent = current.appreciation || "";
  $("art-caption").textContent =
    current.provider === "online" && !current.artExact
      ? "AI 意境配图 · 选自已有插画库"
      : "插画为该句 AI 意境创作";
  $("source-link").textContent =
    current.provider === "online" && !current.artExact
      ? "检索作品原文 ↗"
      : "查阅原文出处 ↗";
  $("provider-note").hidden = current.provider !== "online";
  $("provider-note").textContent = current.artExact
    ? "诗句与原文由今日诗词提供；句意与意境来自离线精选。"
    : "文字与作品译文由今日诗词提供；意境配图选自已有插画库。";
  $("fulltext").textContent = current.fullText;
  $("fulltext-label").textContent = current.excerpt ? "原文节选" : "原文";
  $("source-link").href = current.source;
}

function openDialog(id) {
  if (id !== "settings-dialog") interactionVersion++;
  const dialog = $(id);
  if (!dialog.open) dialog.showModal();
}

function populateLibrary() {
  const saved = favorites
    .map((id) => resolveFavorite(id, favoriteSnapshots))
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
  interactionVersion++;
  favoriteBusy = true;
  $("favorite-button").disabled = true;
  const id = current.id;
  try {
    const result = await request({ type: "favorite", id, quote: current });
    favorites = result.favorites;
    favoriteSnapshots = result.favoriteSnapshots || {};
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
  const oldOnline = settings.onlineEnabled;
  settings = sanitizeSettings({
    onlineEnabled: $("online-enabled").checked,
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
        if (
          oldHemisphere !== snapshot.hemisphere ||
          oldOnline !== snapshot.onlineEnabled
        )
          await nextQuote();
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
  if (changes.favoriteSnapshots) {
    const value = changes.favoriteSnapshots.newValue;
    favoriteSnapshots = value && typeof value === "object" ? value : {};
  }
  if (changes.favorites) {
    const value = changes.favorites.newValue;
    favorites = Array.isArray(value)
      ? value.filter((id) => resolveFavorite(id, favoriteSnapshots))
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
    const [savedSettings, savedFavorites, savedSnapshots] = await Promise.all([
      storage.get("settings", {}),
      storage.get("favorites", []),
      storage.get("favoriteSnapshots", {}),
    ]);
    settings = sanitizeSettings(savedSettings);
    favoriteSnapshots =
      savedSnapshots && typeof savedSnapshots === "object"
        ? savedSnapshots
        : {};
    favorites = Array.isArray(savedFavorites)
      ? savedFavorites.filter((id) => resolveFavorite(id, favoriteSnapshots))
      : [];
  } catch {
    toast("本地数据暂时未能读取");
  }
  applySettings();
  const rawHistory = await storage.get("history", []).catch(() => []);
  await displayQuote(
    selectQuote(QUOTES, context, Array.isArray(rawHistory) ? rawHistory : []),
  );
  if (settings.onlineEnabled && globalThis.chrome?.runtime?.id)
    $("content-source").textContent = "离线精选 · 正在获取在线推荐";
  await nextQuote({ initial: true });
  setInterval(updateClock, 15000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) updateClock();
  });
}
init();
