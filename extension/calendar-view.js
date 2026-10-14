import {
  MIN_YEAR,
  MAX_YEAR,
  dateKey,
  lunarDate,
  solarTermOnDate,
  shiftMonth,
  monthDates,
} from "./calendar.js";
import { createSelect } from "./custom-select.js";
import {
  t,
  locale,
  getLanguage,
  monthLabel,
  yearLabel,
  termLabel,
  lunarLabel,
  lunarAccessible,
} from "./i18n.js";

const $ = (id) => document.getElementById(id);

export function initCalendar(openDialog) {
  let selected = new Date();
  let renderedToday;
  let renderedLanguage;
  const yearSelect = $("calendar-year");
  const monthSelect = $("calendar-month");
  const days = $("calendar-days");
  const yearPicker = createSelect(yearSelect, {
    options: Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => ({
      value: MIN_YEAR + i,
      label: yearLabel(MIN_YEAR + i),
    })),
    value: selected.getFullYear(),
    columns: 3,
    onChange: changeMonth,
  });
  const monthPicker = createSelect(monthSelect, {
    options: Array.from({ length: 12 }, (_, month) => ({
      value: month,
      label: monthLabel(month),
    })),
    value: selected.getMonth(),
    columns: 3,
    onChange: changeMonth,
  });

  function render(focusDay = false) {
    const fullDate = new Intl.DateTimeFormat(locale(), {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    });
    const year = selected.getFullYear();
    const month = selected.getMonth();
    const today = dateKey(new Date());
    renderedToday = today;
    renderedLanguage = getLanguage();
    const selectedKey = dateKey(selected);
    yearPicker.setLabels(
      Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) =>
        yearLabel(MIN_YEAR + i),
      ),
    );
    monthPicker.setLabels(Array.from({ length: 12 }, (_, i) => monthLabel(i)));
    yearPicker.setValue(year);
    monthPicker.setValue(month);
    $("calendar-month-title").textContent =
      getLanguage() === "zh"
        ? `${year}年${month + 1}月`
        : `${monthLabel(month, "long")} ${year}`;
    document.querySelectorAll(".calendar-weekdays span").forEach((span, i) => {
      span.textContent =
        getLanguage() === "zh"
          ? ["一", "二", "三", "四", "五", "六", "日"][i]
          : new Intl.DateTimeFormat(locale(), { weekday: "short" }).format(
              new Date(2026, 9, 5 + i, 12),
            );
    });
    $("calendar-prev").disabled = year === MIN_YEAR && month === 0;
    $("calendar-next").disabled = year === MAX_YEAR && month === 11;
    const terms = [];
    days.replaceChildren(
      ...monthDates(year, month).map((date) => {
        const key = dateKey(date);
        const lunar = lunarDate(date);
        const term = solarTermOnDate(date);
        const inMonth = date.getMonth() === month;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "calendar-day";
        button.dataset.date = key;
        button.classList.toggle("outside-month", !inMonth);
        button.classList.toggle("is-today", key === today);
        button.classList.toggle("has-term", Boolean(term));
        button.setAttribute("aria-pressed", String(key === selectedKey));
        if (key === today) button.setAttribute("aria-current", "date");
        button.setAttribute(
          "aria-label",
          `${fullDate.format(date)} · ${lunarAccessible(lunar)}${term ? ` · ${termLabel(term)}` : ""}${key === today ? ` · ${t("today")}` : ""}`,
        );
        button.tabIndex = key === selectedKey ? 0 : -1;
        button.disabled =
          date.getFullYear() < MIN_YEAR || date.getFullYear() > MAX_YEAR;
        const number = document.createElement("span");
        number.className = "calendar-number";
        number.textContent = String(date.getDate());
        const label = document.createElement("span");
        label.className = "calendar-lunar";
        label.textContent = term
          ? getLanguage() === "en"
            ? t("termShort")
            : term
          : lunarLabel(lunar, true);
        if (term) button.title = termLabel(term);
        button.append(number, label);
        button.addEventListener("click", () => choose(date, true));
        if (inMonth && term)
          terms.push(
            getLanguage() === "zh"
              ? `${term} ${date.getDate()}日`
              : `${termLabel(term)} ${monthLabel(month)} ${date.getDate()}`,
          );
        return button;
      }),
    );
    const lunar = lunarDate(selected);
    const term = solarTermOnDate(selected);
    $("calendar-selected-date").textContent = fullDate.format(selected);
    $("calendar-selected-lunar").textContent = lunarLabel(lunar);
    $("calendar-selected-term").textContent = termLabel(term);
    $("calendar-selected-term").hidden = !term;
    $("calendar-today-label").hidden = selectedKey !== today;
    $("calendar-terms").textContent = t("solarTerms", {
      terms: terms.join(" · "),
    });
    if (focusDay) days.querySelector(`[data-date="${selectedKey}"]`).focus();
  }

  function choose(date, focusDay = false) {
    if (date.getFullYear() < MIN_YEAR || date.getFullYear() > MAX_YEAR) return;
    selected = date;
    render(focusDay);
  }

  $("almanac-button").addEventListener("click", () => {
    choose(new Date());
    openDialog("calendar-dialog");
  });
  $("calendar-prev").addEventListener("click", () =>
    choose(shiftMonth(selected, -1)),
  );
  $("calendar-next").addEventListener("click", () =>
    choose(shiftMonth(selected, 1)),
  );
  $("calendar-today").addEventListener("click", () => choose(new Date(), true));
  function changeMonth() {
    const first = new Date(
      Number(yearSelect.value),
      Number(monthSelect.value),
      1,
      12,
    );
    first.setDate(
      Math.min(
        selected.getDate(),
        new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate(),
      ),
    );
    choose(first);
  }
  days.addEventListener("keydown", (event) => {
    const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let date;
    if (event.key in offsets) {
      date = new Date(
        selected.getFullYear(),
        selected.getMonth(),
        selected.getDate() + offsets[event.key],
        12,
      );
    } else if (event.key === "PageUp" || event.key === "PageDown") {
      date = shiftMonth(selected, event.key === "PageUp" ? -1 : 1);
    } else if (event.key === "Home" || event.key === "End") {
      const weekday = (selected.getDay() + 6) % 7;
      date = new Date(
        selected.getFullYear(),
        selected.getMonth(),
        selected.getDate() + (event.key === "Home" ? -weekday : 6 - weekday),
        12,
      );
    } else return;
    event.preventDefault();
    choose(date, true);
  });
  return () => {
    if (
      $("calendar-dialog").open &&
      (renderedToday !== dateKey(new Date()) ||
        renderedLanguage !== getLanguage())
    ) {
      render(days.contains(document.activeElement));
    }
  };
}
