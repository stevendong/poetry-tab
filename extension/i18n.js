import { TERMS } from "./context.js";

export const MESSAGES = {
  zh: {
    brand: "一笺",
    pageTitle: "一笺 · 诗意新标签页",
    tagline: "打开一页，遇见诗意",
    loading: "正在拾取此刻的诗意",
    read: "读懂这一句",
    clockCaption: "片刻闲暇，也有山川",
    actions: "诗句操作",
    next: "换一句",
    nextHint: "换一句（空格键）",
    favorite: "收藏",
    save: "收藏这句",
    unsave: "取消收藏这句",
    saved: "已收藏",
    library: "收藏册",
    openLibrary: "打开收藏册",
    settings: "设置",
    openSettings: "打开设置",
    calendar: "万年历",
    openCalendar: "打开万年历",
    closeCalendar: "关闭万年历",
    calendarKicker: "一日一页，岁岁年年",
    previousMonth: "上个月",
    nextMonth: "下个月",
    chooseYear: "选择年份",
    chooseMonth: "选择月份",
    today: "今天",
    termHint: "仅在节气当天显示，日期按近似计算",
    solarTerms: "本月节气：{terms}",
    termShort: "节气",
    calendarNote:
      "可查看 1900—2100 年。日期使用本机时区，节气日期采用近似计算。",
    lunarDetail: "农历 {yearName}年 · {animal}年 · {month}{dayName}",
    lunarAccessible: "农历{month}{dayName}",
    readingKicker: "一字一句，皆有来处",
    closeReading: "关闭解读",
    meaning: "句意",
    translation: "作品译文",
    translationPrefix: "作品译文：",
    appreciation: "意境",
    original: "原文",
    excerpt: "原文节选",
    artCaption: "插画为该句 AI 意境创作",
    artHint: "与诗句对应的 AI 插画",
    defaultBackground: "默认背景",
    searchSource: "检索作品原文 ↗",
    source: "查阅原文出处 ↗",
    providerNote: "文字与作品译文由今日诗词提供。",
    providerExact: "诗句与原文由今日诗词提供；句意与意境来自离线精选。",
    missingMeaning: "这首作品暂未提供译文，可展开阅读原文。",
    missingReading: "今日诗词暂未提供这首作品的译文，可结合下方原文阅读。",
    libraryKicker: "把喜欢的句子，留在身边",
    closeLibrary: "关闭收藏册",
    libraryNote: "收藏保存在这台浏览器中，离线也能翻阅。",
    libraryCount: "共 {count} 笺",
    emptyLibrary: "还没有收藏。遇到喜欢的句子，\n点一下心，就能把它留下。",
    fromLibrary: "收藏中的一笺",
    forMoment: "此刻的诗意",
    now: "此刻",
    onlineSource: "今日诗词 · 在线推荐",
    cachedSource: "今日诗词 · 最近推荐",
    offlineSource: "离线精选",
    unavailableSource: "离线精选 · 网络暂不可用",
    repeatedSource: "离线精选 · 在线内容暂未更新",
    fetchingSource: "离线精选 · 正在获取在线推荐",
    settingsKicker: "让诗意，适合你的日常",
    closeSettings: "关闭设置",
    preferences: "偏好设置",
    language: "界面语言",
    languageHint: "诗文与解读保留中文",
    chooseLanguage: "选择界面语言",
    autoLanguage: "跟随浏览器",
    onlineEnabled: "在线诗词推荐",
    onlineHint: "优先今日诗词，断网时使用离线精选",
    hemisphere: "所在半球",
    hemisphereHint: "让四季与你所在的地方相合",
    north: "北半球",
    south: "南半球",
    southSuffix: " · 南半球",
    showClock: "显示时间",
    clockHint: "留一点空间给当下",
    showMeaning: "直接显示句意",
    meaningHint: "在诗句下方显示简短解释",
    textSize: "诗句字号",
    textHint: "读起来更舒适",
    normalSize: "标准",
    largeSize: "较大",
    shade: "背景遮罩",
    shadeHint: "加深遮罩，让文字更清晰",
    settingsNote:
      "设置自动保存。时钟与离线选句使用本机时区；离线四季以立春、立夏、立秋、立冬划分，南半球相反。在线选句由今日诗词服务推荐。节气名称沿用中国传统，交界时刻采用近似计算。",
    privacyNote:
      "内置 17 组离线诗画。在线推荐由今日诗词提供，会依据 IP 等信息推荐；关闭在线推荐后仅使用离线内容。无需账号或定位权限。按空格换一句，按 Esc 关闭面板。",
    noScript: "请启用 JavaScript 以展示与此刻相应的诗词。",
    imageError: "插画暂时未能载入，请检查扩展文件是否完整",
    storageError: "本地存储暂不可用，当前诗句仍可阅读",
    favoriteAdded: "已收入收藏册",
    favoriteRemoved: "已取消收藏",
    favoriteError: "收藏未能保存，请稍后重试",
    settingsError: "设置未能保存，请稍后重试",
    dataError: "本地数据暂时未能读取",
    noResponse: "未收到扩展响应",
    spring: "春日",
    summer: "夏日",
    autumn: "秋日",
    winter: "冬日",
    dawn: "清晨",
    day: "日间",
    dusk: "黄昏",
    night: "夜晚",
  },
  en: {
    brand: "Yijian",
    pageTitle: "Yijian · Poetry New Tab",
    tagline: "A moment of poetry",
    loading: "Finding a poem for this moment",
    read: "Read this poem",
    clockCaption: "A moment to wander",
    actions: "Poem actions",
    next: "Another poem",
    nextHint: "Another poem (Space)",
    favorite: "Save",
    save: "Save this poem",
    unsave: "Remove this poem from favorites",
    saved: "Saved",
    library: "Favorites",
    openLibrary: "Open favorites",
    settings: "Settings",
    openSettings: "Open settings",
    calendar: "Calendar",
    openCalendar: "Open calendar",
    closeCalendar: "Close calendar",
    calendarKicker: "Days turn, seasons return",
    previousMonth: "Previous month",
    nextMonth: "Next month",
    chooseYear: "Choose year",
    chooseMonth: "Choose month",
    today: "Today",
    termHint: "Shown on the solar term's date only; dates are approximate",
    solarTerms: "Solar terms this month: {terms}",
    termShort: "Term",
    calendarNote:
      "Browse 1900–2100. Dates follow your local time zone; solar term dates are approximate.",
    lunarDetail:
      "Chinese lunar calendar · Year of the {animal} · {month}, day {day}",
    lunarAccessible: "Chinese lunar date: {month}, day {day}",
    readingKicker: "Every line has a story",
    closeReading: "Close poem details",
    meaning: "Meaning (Chinese)",
    translation: "Translation (Chinese)",
    translationPrefix: "Translation (Chinese): ",
    appreciation: "Commentary (Chinese)",
    original: "Original text",
    excerpt: "Excerpt",
    artCaption: "AI illustration created for this poem",
    artHint: "AI illustration created for this poem",
    defaultBackground: "Default background",
    searchSource: "Search for the original ↗",
    source: "View original source ↗",
    providerNote: "Poem and Chinese translation provided by Jinrishici.",
    providerExact:
      "Poem provided by Jinrishici; Chinese explanation and commentary from the offline collection.",
    missingMeaning:
      "No translation is available for this poem. Open it to read the original.",
    missingReading:
      "Jinrishici has no translation for this poem. You can read the original below.",
    libraryKicker: "Keep the lines you love",
    closeLibrary: "Close favorites",
    libraryNote:
      "Your favorites stay in this browser and are available offline.",
    libraryCount: "{count} saved {noun}",
    emptyLibrary: "No favorites yet.\nTap the heart to keep a poem you love.",
    fromLibrary: "From your favorites",
    forMoment: "For this moment",
    now: "This moment",
    onlineSource: "Jinrishici · Online",
    cachedSource: "Jinrishici · Recent recommendation",
    offlineSource: "Offline collection",
    unavailableSource: "Offline collection · Network unavailable",
    repeatedSource: "Offline collection · No new online poem",
    fetchingSource: "Offline collection · Finding an online poem",
    settingsKicker: "Make room for poetry",
    closeSettings: "Close settings",
    preferences: "Preferences",
    language: "Interface language",
    languageHint: "Poems and commentary remain in Chinese",
    chooseLanguage: "Choose interface language",
    autoLanguage: "Browser default",
    onlineEnabled: "Online recommendations",
    onlineHint: "Jinrishici first; offline poems when disconnected",
    hemisphere: "Hemisphere",
    hemisphereHint: "Match the seasons where you are",
    north: "Northern",
    south: "Southern",
    southSuffix: " · Southern hemisphere",
    showClock: "Show clock",
    clockHint: "A little space for the present",
    showMeaning: "Show explanation",
    meaningHint: "Display the Chinese explanation below the poem",
    textSize: "Poem text size",
    textHint: "Find a comfortable reading size",
    normalSize: "Standard",
    largeSize: "Large",
    shade: "Background shade",
    shadeHint: "Darken the background for clearer text",
    settingsNote:
      "Settings save automatically. The clock and offline selection follow your local time zone. Seasons start at the traditional solar terms for spring, summer, autumn and winter, and reverse in the Southern Hemisphere. Online poems are selected by Jinrishici. Solar term dates are approximate.",
    privacyNote:
      "Includes 17 offline poems with illustrations. Jinrishici uses information such as your IP address for online recommendations. Turn online recommendations off to use only local content. No account or location permission is required. Press Space for another poem and Esc to close a panel.",
    noScript: "Enable JavaScript to see a poem for this moment.",
    imageError:
      "The illustration could not load. Check that the extension files are complete.",
    storageError: "Local storage is unavailable. You can still read this poem.",
    favoriteAdded: "Saved to favorites",
    favoriteRemoved: "Removed from favorites",
    favoriteError: "Could not save favorites. Please try again.",
    settingsError: "Could not save settings. Please try again.",
    dataError: "Could not read local data.",
    noResponse: "No response from the extension",
    spring: "Spring",
    summer: "Summer",
    autumn: "Autumn",
    winter: "Winter",
    dawn: "Morning",
    day: "Daytime",
    dusk: "Evening",
    night: "Night",
  },
};

let language = "zh";
export function resolveLanguage(
  preference = "auto",
  browserLanguage = globalThis.navigator?.language || "zh-CN",
) {
  if (preference === "zh" || preference === "en") return preference;
  return browserLanguage.toLowerCase().startsWith("zh") ? "zh" : "en";
}
export function setLanguage(preference) {
  language = resolveLanguage(preference);
}
export function getLanguage() {
  return language;
}
export function locale() {
  return language === "en" ? "en-US" : "zh-CN";
}
export function t(key, values = {}) {
  const text = MESSAGES[language][key] ?? MESSAGES.zh[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    String(values[name] ?? match),
  );
}
export function translateDocument(root = document) {
  root.documentElement.lang = locale();
  for (const [attribute, target] of [
    ["data-i18n", null],
    ["data-i18n-title", "title"],
    ["data-i18n-aria-label", "aria-label"],
  ]) {
    root.querySelectorAll(`[${attribute}]`).forEach((element) => {
      const value = t(element.getAttribute(attribute));
      if (target) element.setAttribute(target, value);
      else element.textContent = value;
    });
  }
}

// English names follow the Hong Kong Observatory's 24 solar terms calendar.
// https://www.hko.gov.hk/en/gts/time/24solarterms.htm
const EN_TERMS = [
  "Spring Commences",
  "Spring Showers",
  "Insects Waken",
  "Vernal Equinox",
  "Bright and Clear",
  "Corn Rain",
  "Summer Commences",
  "Corn Forms",
  "Corn on Ear",
  "Summer Solstice",
  "Moderate Heat",
  "Great Heat",
  "Autumn Commences",
  "End of Heat",
  "White Dew",
  "Autumnal Equinox",
  "Cold Dew",
  "Frost",
  "Winter Commences",
  "Light Snow",
  "Heavy Snow",
  "Winter Solstice",
  "Moderate Cold",
  "Severe Cold",
];
const EN_ANIMALS = [
  "Rat",
  "Ox",
  "Tiger",
  "Rabbit",
  "Dragon",
  "Snake",
  "Horse",
  "Goat",
  "Monkey",
  "Rooster",
  "Dog",
  "Pig",
];
export function termLabel(term) {
  return language === "en" ? EN_TERMS[TERMS.indexOf(term)] || term : term;
}
export function monthLabel(month, style = "short") {
  return language === "zh"
    ? `${month + 1}月`
    : new Intl.DateTimeFormat(locale(), { month: style }).format(
        new Date(2026, month, 1),
      );
}
export function yearLabel(year) {
  return language === "zh" ? `${year}年` : String(year);
}
export function lunarLabel(lunar, compact = false) {
  if (language === "zh") return compact ? lunar.label : t("lunarDetail", lunar);
  const month = `${lunar.isLeap ? "Leap month" : "Month"} ${lunar.monthNumber}`;
  if (compact)
    return lunar.day === 1
      ? `${lunar.isLeap ? "L" : "M"}${lunar.monthNumber}`
      : String(lunar.day);
  return t("lunarDetail", {
    ...lunar,
    month,
    animal: EN_ANIMALS[(((lunar.year - 4) % 12) + 12) % 12],
  });
}
export function lunarAccessible(lunar) {
  return t("lunarAccessible", {
    ...lunar,
    month:
      language === "en"
        ? `${lunar.isLeap ? "Leap month" : "Month"} ${lunar.monthNumber}`
        : lunar.month,
  });
}
