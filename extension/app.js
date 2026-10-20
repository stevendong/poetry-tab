import { endpointFor, originPattern } from "./custom.js";
import { QUOTES } from "./quotes.js";
import { getContext, selectQuote } from "./context.js";
import { storage, sanitizeSettings, DEFAULT_SETTINGS } from "./storage.js";
import { createStateController } from "./state.js";
import { resolveFavorite } from "./online.js";
import { formatVerse } from "./verse.js";
import { solarTermOnDate } from "./calendar.js";
import { initCalendar } from "./calendar-view.js";
import { createSelect } from "./custom-select.js";
import { createBackgroundPrefetch } from "./background-prefetch.js";
import { quotationRequest, validQuotationId } from "./service-client.js";
import {
  t,
  setLanguage,
  getLanguage,
  locale,
  chineseLocale,
  chineseText,
  translateDocument,
  termLabel,
} from "./i18n.js";
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
let currentSelection = {};
let currentFromLibrary = false;
let waitingForOnline = false;
let toastKey;
let apiStatusKey = "";
let specifiedStatusKey = "";
const backgroundPrefetch = createBackgroundPrefetch();
let prefetchSources = [];
let backgroundReadyVersion = 0;
let mediaConfigKey = "";

function toast(key) {
  clearTimeout(toastTimer);
  toastKey = key;
  $("toast").textContent = t(key);
  $("toast").hidden = false;
  toastTimer = setTimeout(() => {
    $("toast").hidden = true;
  }, 3300);
}

async function request(message) {
  if (globalThis.chrome?.runtime?.id) {
    const result = await chrome.runtime.sendMessage(message);
    if (result?.error) throw new Error(result.error);
    if (!result?.data) throw new Error(t("noResponse"));
    return result.data;
  }
  const act = () => previewController.handle(message);
  return navigator.locks ? navigator.locks.request("yijian-state", act) : act();
}

function updateClock() {
  const now = new Date();
  context = getContext(now, settings.hemisphere);
  $("clock").textContent = new Intl.DateTimeFormat(locale(), {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  $("clock").dateTime = now.toISOString();
  $("date-label").textContent = new Intl.DateTimeFormat(locale(), {
    month: getLanguage() === "en" ? "short" : "long",
    day: "numeric",
    weekday: getLanguage() === "en" ? "short" : "long",
  }).format(now);
  $("season-label").textContent =
    t(context.season) +
    (settings.hemisphere === "south" ? t("southSuffix") : "");
  const term = solarTermOnDate(now);
  $("term-label").textContent = termLabel(term);
  $("term-label").hidden = !term;
  $("term-dot").hidden = !term;
  refreshCalendar();
}

function applySettings() {
  const nextMediaKey = JSON.stringify([
    settings.onlineEnabled, settings.provider, settings.serviceUrl,
    settings.customUrl, settings.mediaPreference, settings.hemisphere,
  ]);
  if (nextMediaKey !== mediaConfigKey) {
    backgroundPrefetch.stop();
    prefetchSources = [];
    mediaConfigKey = nextMediaKey;
  }
  setLanguage(settings.language);
  translateDocument();
  languagePicker.setLabels([
    t("autoLanguage"),
    "简体中文",
    "繁體中文",
    "English",
  ]);
  languagePicker.setValue(settings.language);
  document.documentElement.style.setProperty(
    "--shade",
    String(settings.shade / 100),
  );
  document.body.classList.toggle("large-text", settings.textSize === "large");
  document.body.dataset.poemFont = settings.poemFont;
  $("clock-wrap").hidden = !settings.showClock;
  $("inline-meaning").hidden = !settings.showMeaning;
  $("online-enabled").checked = settings.onlineEnabled;
  $("hemisphere").value = settings.hemisphere;
  $("show-clock").checked = settings.showClock;
  $("show-meaning").checked = settings.showMeaning;
  $("text-size").value = settings.textSize;
  $("poem-font").value = settings.poemFont;
  $("shade").value = settings.shade;
  syncApiSettings();
  if (current) updateQuoteText();
  if ($("library-dialog").open) populateLibrary();
  if (toastKey && !$("toast").hidden) $("toast").textContent = t(toastKey);
  if (specifiedStatusKey) $("specified-status").textContent = t(specifiedStatusKey);
  updateClock();
}

function setApiStatus(key) {
  apiStatusKey = key;
  $("api-status").textContent = t(key);
}
function providerLabel(quote) {
  return t(quote.apiProvider === "service" ? "serviceSource" : "customSource");
}
function syncApiSettings() {
  $("api-provider").value = settings.provider;
  $("api-url").value =
    settings.provider === "service" ? settings.serviceUrl : settings.customUrl;
  $("media-preference").value = settings.mediaPreference;
  showApiFields();
  if (apiStatusKey) $("api-status").textContent = t(apiStatusKey);
}
function showApiFields() {
  const provider = $("api-provider").value;
  $("api-details").hidden = provider === "jinrishici";
  $("api-help").textContent = t(
    provider === "service" ? "serviceHelp" : "customHelp",
  );
}

async function requestApiPermission(endpoint) {
  if (!globalThis.chrome?.runtime?.id || !chrome.permissions?.request)
    throw new Error("apiExtensionOnly");
  let allowed;
  try {
    allowed = await chrome.permissions.request({ origins: [originPattern(endpoint)] });
  } catch (error) {
    console.warn("API site permission request failed:", error);
    throw new Error(/Only permissions specified in the manifest/i.test(error.message)
      ? "apiReloadExtension" : "apiPermissionError");
  }
  if (!allowed) throw new Error("apiDenied");
}

$("api-provider").addEventListener("change", () => {
  $("api-url").value =
    $("api-provider").value === "service"
      ? settings.serviceUrl
      : settings.customUrl;
  setApiStatus("apiUnsaved");
  showApiFields();
});
$("save-api").addEventListener("click", async () => {
  const provider = $("api-provider").value;
  const config = { provider, mediaPreference: $("media-preference").value };
  if (provider !== "jinrishici")
    config[provider === "service" ? "serviceUrl" : "customUrl"] =
      $("api-url").value.trim();
  $("save-api").disabled = true;
  try {
    let endpoint;
    try {
      endpoint = endpointFor({ ...settings, ...config });
    } catch {
      throw new Error("apiInvalid");
    }
    if (provider !== "jinrishici") {
      // Request access in the click gesture, before any storage awaits.
      await requestApiPermission(endpoint);
    }
    await settingsWrites.catch(() => {});
    const savedSettings = sanitizeSettings({ ...settings, ...config });
    await storage.set("settings", savedSettings);
    settings = savedSettings;
    applySettings();
    setApiStatus(settings.onlineEnabled ? "apiConnecting" : "apiSavedDisabled");
    if (settings.onlineEnabled) await nextQuote();
  } catch (error) {
    setApiStatus(
      [
        "apiInvalid",
        "apiExtensionOnly",
        "apiDenied",
        "apiReloadExtension",
        "apiPermissionError",
      ].includes(error.message)
        ? error.message
        : "apiError",
    );
  } finally {
    $("save-api").disabled = false;
  }
});

function setSpecifiedStatus(key) {
  specifiedStatusKey = key;
  $("specified-status").textContent = t(key);
}

$("specified-load").addEventListener("click", async () => {
  const id = $("specified-id").value.trim();
  if (!validQuotationId(id)) {
    setSpecifiedStatus("specifiedInvalidId");
    return;
  }
  if (!settings.onlineEnabled) {
    setSpecifiedStatus("specifiedNeedsOnline");
    return;
  }
  const interaction = ++interactionVersion;
  const version = renderVersion;
  pendingSelection = false;
  backgroundPrefetch.stop();
  $("specified-load").disabled = true;
  setSpecifiedStatus("specifiedLoading");
  try {
    let endpoint;
    try {
      endpoint = quotationRequest(settings, id);
    } catch {
      throw new Error("apiInvalid");
    }
    await requestApiPermission(endpoint);
    await settingsWrites.catch(() => {});
    const result = await request({ type: "load", id });
    if (interaction !== interactionVersion || version !== renderVersion) {
      setSpecifiedStatus("specifiedChanged");
      return;
    }
    if (!result.quote) {
      setSpecifiedStatus({
        invalid_id: "specifiedInvalidId", invalid_url: "apiInvalid",
        disabled: "specifiedNeedsOnline", permission: "specifiedPermission",
        not_found: "specifiedNotFound", rate_limited: "apiRateLimited",
        changed: "specifiedChanged",
      }[result.status] || "specifiedUnavailable");
      return;
    }
    context = result.context;
    displayQuote(result.quote, false, result);
    setSpecifiedStatus("specifiedLoaded");
    $("settings-dialog").close();
  } catch (error) {
    setSpecifiedStatus({
      apiDenied: "specifiedPermission", apiPermissionError: "specifiedPermission",
      apiExtensionOnly: "specifiedExtensionOnly", apiReloadExtension: "apiReloadExtension",
      apiInvalid: "apiInvalid",
    }[error.message] || "specifiedUnavailable");
  } finally {
    $("specified-load").disabled = false;
    warmBackgrounds();
  }
});
$("specified-id").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    $("specified-load").click();
  }
});

function updateFavorite() {
  const saved = current && favorites.includes(current.id);
  $("favorite-button").setAttribute("aria-pressed", String(Boolean(saved)));
  $("favorite-button").setAttribute("aria-label", t(saved ? "unsave" : "save"));
  $("favorite-button").title = t(saved ? "unsave" : "save");
  $("favorite-label").textContent = t(saved ? "saved" : "favorite");
}

function updateQuoteText() {
  const quote = current;
  const fromLibrary = currentFromLibrary;
  const selection = currentSelection;
  const online = ["online", "custom"].includes(quote.provider);
  const hasArt = Boolean(quote.art) && (!online || quote.artExact);
  document.body.classList.toggle(
    "long-verse",
    quote.lines.some((line) => line.length > 12),
  );
  const fallbackSource =
    {
      permission: "permissionSource",
      unavailable: "unavailableSource",
      rate_limited: "rateLimitedSource",
      empty: "emptySource",
      repeat: "repeatedSource",
    }[selection.status] || "offlineSource";
  $("content-source").textContent = t(
    waitingForOnline
      ? "fetchingSource"
      : online
        ? selection.source === "cached"
          ? "cachedSource"
          : "onlineSource"
        : fallbackSource,
  );
  if (quote.provider === "custom" && !waitingForOnline)
    $("content-source").textContent = t(
      selection.source === "specified"
        ? "specifiedSource"
        : selection.status === "rate_limited"
        ? "customRateLimitedSource"
        : selection.status === "unavailable" && selection.source === "cached"
          ? "customUnavailableCachedSource"
          : selection.source === "cached"
            ? "customCachedSource"
            : "customOnlineSource",
      { provider: providerLabel(quote) },
    );
  $("content-source").title = t(
    quote.media && settings.onlineEnabled
      ? quote.media.type === "video"
        ? "remoteVideoHint"
        : "remoteImageHint"
      : hasArt
        ? "artHint"
        : "defaultBackground",
  );
  const nodes = quote.lines.map((line) => {
    const span = document.createElement("span");
    span.textContent = chineseText(line);
    return span;
  });
  $("verse").replaceChildren(...nodes);
  $("byline").textContent = chineseText(
    `${quote.dynasty} · ${quote.author}  /  《${quote.title}》`,
  );
  $("reason").textContent = fromLibrary
    ? t("fromLibrary")
    : online
      ? (getLanguage() !== "en" &&
          chineseText(quote.tags?.join(" · ") || "")) ||
        t("forMoment")
      : `${t(quote.seasons.includes(context.season) ? context.season : "now")} · ${t(context.period)}`;
  $("inline-meaning").textContent = quote.meaning
    ? (quote.provider === "online" && quote.meaningHeading === "作品译文"
        ? t("translationPrefix")
        : "") +
      chineseText(quote.meaning.slice(0, 120)) +
      (quote.meaning.length > 120 ? "…" : "")
    : t("missingMeaning");
  $("inline-meaning").lang = quote.meaning ? chineseLocale() : locale();
  document.title = `${chineseText(formatVerse(quote))} · ${t("brand")}`;
  updateFavorite();
  populateReading();
}

function displayQuote(quote, fromLibrary = false, selection = {}) {
  const version = ++renderVersion;
  backgroundPrefetch.stop();
  prefetchSources = Array.isArray(selection.prefetch) ? selection.prefetch : [];
  current = quote;
  currentSelection = selection;
  currentFromLibrary = fromLibrary;
  waitingForOnline = false;
  updateQuoteText();
  document.body.dataset.quote = quote.id;
  // Reading and switching poems must not wait for a slow media download.
  void displayBackground(quote, version);
}

async function displayBackground(quote, version) {
  const hasArt =
    Boolean(quote.art) && (quote.provider !== "online" || quote.artExact);
  const remoteMedia =
    quote.provider === "custom" && settings.onlineEnabled ? quote.media : null;
  const art = $("art");
  const src = remoteMedia
    ? remoteMedia.type === "video"
      ? remoteMedia.posterUrl
      : remoteMedia.url
    : hasArt
      ? `assets/art/${quote.art}.webp`
      : null;
  if (remoteMedia)
    $("content-source").title = t(
      remoteMedia.type === "video" ? "remoteVideoHint" : "remoteImageHint",
    );
  if (!src) {
    resetBackground();
    backgroundReady(version);
    return;
  }
  if (
    !remoteMedia &&
    art.getAttribute("src") === src &&
    art.classList.contains("loaded") &&
    !art.hidden
  ) {
    backgroundReady(version);
    return;
  }
  resetBackground();
  $("background-loading").hidden = false;
  // Fetch the video alongside its poster, rather than waiting for the poster.
  if (remoteMedia?.type === "video") startVideo(remoteMedia, version);
  const image = new Image();
  image.referrerPolicy = "no-referrer";
  image.fetchPriority = "high";
  image.src = src;
  try {
    await image.decode();
    if (version !== renderVersion) return;
    art.src = src;
    revealBackground(art);
    if (document.body.dataset.background !== "video")
      document.body.dataset.background = "art";
    if (
      remoteMedia?.type !== "video" ||
      $("background-video").error ||
      !$("background-video").hidden
    ) {
      $("background-loading").hidden = true;
      backgroundReady(version);
    }
  } catch {
    if (version !== renderVersion) return;
    // A missing poster must not cancel a video that can still play.
    if (remoteMedia?.type === "video" && !$("background-video").error) {
      return;
    }
    resetBackground();
    $("art-caption").textContent = t("defaultBackground");
    $("content-source").title = t("defaultBackground");
    toast(remoteMedia ? "remoteImageError" : "imageError");
  }
}

function warmBackgrounds() {
  if (!settings.onlineEnabled || backgroundReadyVersion !== renderVersion) return;
  const media = current?.provider === "custom" ? current.media : null;
  const src = media
    ? media.type === "video" ? media.posterUrl : media.url
    : $("art").getAttribute("src");
  backgroundPrefetch.warm(prefetchSources.filter((source) => source !== src));
}

function backgroundReady(version) {
  if (version !== renderVersion) return;
  backgroundReadyVersion = version;
  warmBackgrounds();
}

function revealBackground(element) {
  // Flush display:none first so a cached image starts a fresh transition.
  void element.offsetWidth;
  element.hidden = false;
  // Commit the transparent state after display:none, including cached images.
  void element.offsetWidth;
  element.classList.add("loaded");
}

function startVideo(media, version) {
  const video = $("background-video");
  video.muted = true;
  video.preload = "auto";
  video.poster = media.posterUrl;
  video.onloadeddata = () => {
    if (version !== renderVersion) return;
    revealBackground(video);
    $("background-loading").hidden = true;
    document.body.dataset.background = "video";
    backgroundReady(version);
    void video.play().catch(() => {
      if (version !== renderVersion) return;
      video.hidden = true;
      document.body.dataset.background = $("art").hidden ? "default" : "art";
    });
  };
  video.onerror = () => {
    if (version !== renderVersion) return;
    $("background-loading").hidden = true;
    video.hidden = true;
    video.pause();
    document.body.dataset.background = $("art").hidden ? "default" : "art";
  };
  video.src = media.url;
  video.load();
}
function resetBackground() {
  backgroundPrefetch.stop();
  backgroundReadyVersion = 0;
  $("background-loading").hidden = true;
  const video = $("background-video");
  video.onloadeddata = null;
  video.onerror = null;
  video.pause();
  video.hidden = true;
  video.classList.remove("loaded");
  video.removeAttribute("src");
  video.removeAttribute("poster");
  video.load();
  $("art").hidden = true;
  $("art").removeAttribute("src");
  $("art").classList.remove("loaded");
  document.body.dataset.background = "default";
}

async function refreshCandidates() {
  const version = renderVersion;
  const interaction = interactionVersion;
  const config = mediaConfigKey;
  try {
    const result = await request({ type: "select", refreshOnly: true, currentId: current?.id });
    if (!result || version !== renderVersion || interaction !== interactionVersion ||
      config !== mediaConfigKey || !settings.onlineEnabled) return;
    if (["empty", "permission"].includes(result.status)) {
      await nextQuote();
      return;
    }
    // Refresh the pool without replacing a poem already being read.
    currentSelection = { ...currentSelection, status: result.status };
    updateQuoteText();
    setApiStatus(result.status === "unavailable" ? "apiCachedUnavailable" :
      result.status === "rate_limited" ? "apiRateLimited" : "apiSuccess");
    prefetchSources = Array.isArray(result.prefetch) ? result.prefetch : [];
    warmBackgrounds();
  } catch {
    // Keep the cached poem and its matching background on a transient failure.
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
    if (settings.provider !== "jinrishici") {
      const statusKey = {
        rate_limited: "apiRateLimited",
        empty: "apiEmpty",
        permission: "apiPermission",
        repeat: "apiRepeat",
      }[result.status];
      setApiStatus(
        statusKey ||
          (result.status === "unavailable"
            ? result.source === "cached"
              ? "apiCachedUnavailable"
              : "apiUnavailable"
            : result.quote?.provider === "custom"
              ? "apiSuccess"
              : "apiSaved"),
      );
    }
    context = result.context;
    const quote = result.quote || QUOTES.find((q) => q.id === result.quoteId);
    if (!quote) throw new Error("Unknown quote");
    if (
      interactionVersion === interactionAtRequest &&
      renderVersion === viewAtRequest
    )
      displayQuote(quote, false, result);
    else if (waitingForOnline) {
      waitingForOnline = false;
      updateQuoteText();
    }
  } catch (error) {
    if (interactionVersion !== interactionAtRequest || renderVersion !== viewAtRequest) return;
    console.error("Selection failed:", error.message);
    // Still show context-appropriate content if persistent storage is unavailable.
    context = getContext(new Date(), settings.hemisphere);
    displayQuote(
      selectQuote(QUOTES, context, [], Math.random, current?.id),
    );
    toast("storageError");
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
  $("reading-title").textContent = chineseText(current.title);
  $("reading-byline").textContent = chineseText(
    `${current.dynasty} · ${current.author} · ${current.kind}`,
  );
  $("reading-verse").textContent = chineseText(formatVerse(current, true));
  $("meaning-heading").textContent = t(
    current.meaningHeading === "作品译文" ? "translation" : "meaning",
  );
  $("meaning").textContent = current.meaning
    ? chineseText(current.meaning)
    : t("missingReading");
  $("meaning").lang = current.meaning ? chineseLocale() : locale();
  $("appreciation-section").hidden = !current.appreciation;
  $("appreciation").textContent = chineseText(current.appreciation || "");
  $("art-caption").textContent =
    current.provider === "custom" && current.media && settings.onlineEnabled
      ? t(
          current.media.type === "video"
            ? "remoteVideoCaption"
            : "remoteImageCaption",
        )
      : current.art && (current.provider !== "online" || current.artExact)
        ? t("artCaption")
        : t("defaultBackground");
  $("source-link").textContent =
    current.provider === "online" && !current.artExact
      ? t("searchSource")
      : t("source");
  $("provider-note").hidden = !["online", "custom"].includes(current.provider);
  $("provider-note").textContent =
    current.provider === "custom"
      ? t("remoteProviderNote", { provider: providerLabel(current) })
      : current.artExact
        ? t("providerExact")
        : t("providerNote");
  $("fulltext").textContent = chineseText(current.fullText);
  $("fulltext-label").textContent = t(current.excerpt ? "excerpt" : "original");
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
  $("library-count").textContent = t("libraryCount", {
    count: saved.length,
    noun: saved.length === 1 ? "poem" : "poems",
  });
  if (!saved.length) {
    const p = document.createElement("p");
    p.className = "empty-library";
    p.textContent = t("emptyLibrary");
    $("library-list").replaceChildren(p);
    return;
  }
  $("library-list").replaceChildren(
    ...saved.map((quote) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "saved-quote";
      const text = document.createElement("span");
      text.lang = chineseLocale();
      const strong = document.createElement("strong");
      strong.textContent = chineseText(formatVerse(quote));
      const small = document.createElement("small");
      small.textContent = chineseText(`${quote.author} · ${quote.title}`);
      text.append(strong, small);
      const arrow = document.createElement("span");
      arrow.textContent = "↗";
      arrow.setAttribute("aria-hidden", "true");
      button.append(text, arrow);
      button.addEventListener("click", () => {
        $("library-dialog").close();
        displayQuote(quote, true);
      });
      return button;
    }),
  );
}

const refreshCalendar = initCalendar(openDialog);
const languagePicker = createSelect($("language"), {
  options: [
    { value: "auto", label: t("autoLanguage") },
    { value: "zh", label: "简体中文" },
    { value: "zh-TW", label: "繁體中文" },
    { value: "en", label: "English" },
  ],
  value: settings.language,
  onChange: () =>
    $("language").dispatchEvent(new Event("change", { bubbles: true })),
});

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
    toast(favorites.includes(id) ? "favoriteAdded" : "favoriteRemoved");
  } catch {
    toast("favoriteError");
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
$("settings-form").addEventListener("change", (event) => {
  if (event.target.closest(".api-settings")) return;
  const oldHemisphere = settings.hemisphere;
  const oldOnline = settings.onlineEnabled;
  settings = sanitizeSettings({
    ...settings,
    language: $("language").value,
    onlineEnabled: $("online-enabled").checked,
    hemisphere: $("hemisphere").value,
    showClock: $("show-clock").checked,
    showMeaning: $("show-meaning").checked,
    poemFont: $("poem-font").value,
    textSize: $("text-size").value,
    shade: Number($("shade").value),
  });
  applySettings();
  if (current?.provider === "custom" && !settings.onlineEnabled) {
    renderVersion++;
    resetBackground();
    populateReading();
  }
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
        toast("settingsError");
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
    const oldSettings = settings;
    settings = sanitizeSettings(changes.settings.newValue);
    applySettings();
    if (
      current?.provider === "custom" &&
      oldSettings.onlineEnabled !== settings.onlineEnabled
    )
      displayQuote(current);
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
    toast("dataError");
  }
  applySettings();
  const startupConfig = mediaConfigKey;
  const [rawHistory, cached] = await Promise.all([
    storage.get("history", []).catch(() => []),
    settings.onlineEnabled && globalThis.chrome?.runtime?.id
      ? request({ type: "select", cacheOnly: true, initial: true }).catch(() => null)
      : null,
  ]);
  if (cached?.quote && startupConfig === mediaConfigKey) {
    context = cached.context;
    displayQuote(cached.quote, false, cached);
    $("next-button").disabled = false;
    $("poetry").setAttribute("aria-busy", "false");
    void refreshCandidates();
  } else {
    displayQuote(selectQuote(QUOTES, context, Array.isArray(rawHistory) ? rawHistory : []));
    if (settings.onlineEnabled && globalThis.chrome?.runtime?.id) {
      waitingForOnline = true;
      updateQuoteText();
    }
    await nextQuote({ initial: true });
  }
  setInterval(updateClock, 15000);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) backgroundPrefetch.stop();
    else {
      updateClock();
      warmBackgrounds();
    }
  });
}
init();
