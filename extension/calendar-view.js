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

const $ = (id) => document.getElementById(id);
const fullDate = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
});

export function initCalendar(openDialog) {
  let selected = new Date();
  let renderedToday;
  const yearSelect = $("calendar-year");
  const monthSelect = $("calendar-month");
  const days = $("calendar-days");
  const yearPicker = createSelect(yearSelect, {
    options: Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => ({
      value: MIN_YEAR + i,
      label: `${MIN_YEAR + i}年`,
    })),
    value: selected.getFullYear(),
    columns: 3,
    onChange: changeMonth,
  });
  const monthPicker = createSelect(monthSelect, {
    options: Array.from({ length: 12 }, (_, month) => ({
      value: month,
      label: `${month + 1}月`,
    })),
    value: selected.getMonth(),
    columns: 3,
    onChange: changeMonth,
  });

  function render(focusDay = false) {
    const year = selected.getFullYear();
    const month = selected.getMonth();
    const today = dateKey(new Date());
    renderedToday = today;
    const selectedKey = dateKey(selected);
    yearPicker.setValue(year);
    monthPicker.setValue(month);
    $("calendar-month-title").textContent = `${year}年${month + 1}月`;
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
          `${fullDate.format(date)}，农历${lunar.month}${lunar.dayName}${term ? `，${term}` : ""}${key === today ? "，今天" : ""}`,
        );
        button.tabIndex = key === selectedKey ? 0 : -1;
        button.disabled =
          date.getFullYear() < MIN_YEAR || date.getFullYear() > MAX_YEAR;
        const number = document.createElement("span");
        number.className = "calendar-number";
        number.textContent = String(date.getDate());
        const label = document.createElement("span");
        label.className = "calendar-lunar";
        label.textContent = term || lunar.label;
        button.append(number, label);
        button.addEventListener("click", () => choose(date, true));
        if (inMonth && term) terms.push(`${term} ${date.getDate()}日`);
        return button;
      }),
    );
    const lunar = lunarDate(selected);
    const term = solarTermOnDate(selected);
    $("calendar-selected-date").textContent = fullDate.format(selected);
    $("calendar-selected-lunar").textContent =
      `农历 ${lunar.yearName}年 · ${lunar.animal}年 · ${lunar.month}${lunar.dayName}`;
    $("calendar-selected-term").textContent = term;
    $("calendar-selected-term").hidden = !term;
    $("calendar-today-label").hidden = selectedKey !== today;
    $("calendar-terms").textContent = `本月节气：${terms.join(" · ")}`;
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
    if ($("calendar-dialog").open && renderedToday !== dateKey(new Date())) {
      render(days.contains(document.activeElement));
    }
  };
}
