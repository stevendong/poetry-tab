// Custom listbox styling and interaction; the popover keeps it above dialog overflow.
export function createSelect(
  button,
  { options, value, onChange, columns = 1 },
) {
  let selectedIndex = 0;
  let activeIndex = 0;
  let opened = false;
  let search = "";
  let lastTyped = 0;
  const menu = document.createElement("div");
  menu.id = `${button.id}-options`;
  menu.className = "custom-select-menu";
  menu.popover = "manual";
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", button.getAttribute("aria-label"));
  menu.style.setProperty("--select-columns", columns);
  const label = document.createElement("span");
  const arrow = document.createElement("span");
  arrow.className = "custom-select-arrow";
  arrow.setAttribute("aria-hidden", "true");
  button.replaceChildren(label, arrow);
  button.classList.add("custom-select");
  button.setAttribute("role", "combobox");
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-controls", menu.id);
  button.setAttribute("aria-expanded", "false");
  const dialog = button.closest("dialog");
  dialog.append(menu);
  const items = options.map((option, index) => {
    const item = document.createElement("div");
    item.id = `${menu.id}-${index}`;
    item.className = "custom-select-option";
    item.dataset.value = String(option.value);
    item.setAttribute("role", "option");
    item.textContent = option.label;
    item.addEventListener("click", () => commit(index));
    item.addEventListener("pointermove", () => activate(index, false));
    menu.append(item);
    return item;
  });

  function setValue(nextValue) {
    const index = options.findIndex(
      (option) => String(option.value) === String(nextValue),
    );
    if (index < 0) return;
    selectedIndex = index;
    button.value = String(options[index].value);
    label.textContent = options[index].label;
    items.forEach((item, i) =>
      item.setAttribute("aria-selected", String(i === index)),
    );
    if (opened) activate(index);
  }

  function position() {
    const rect = button.getBoundingClientRect();
    const width = Math.min(
      Math.max(rect.width, columns > 1 ? 232 : 160),
      innerWidth - 24,
    );
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, innerWidth - width - 12))}px`;
    const below = innerHeight - rect.bottom - 20;
    const above = rect.top - 20;
    const upwards = below < Math.min(254, menu.scrollHeight) && above > below;
    menu.style.maxHeight = `${Math.max(40, Math.min(254, upwards ? above : below))}px`;
    menu.style.top = `${upwards ? rect.top - menu.offsetHeight - 8 : rect.bottom + 8}px`;
  }

  function activate(index, reveal = true) {
    activeIndex = Math.max(0, Math.min(items.length - 1, index));
    items.forEach((item, i) =>
      item.classList.toggle("is-active", i === activeIndex),
    );
    button.setAttribute("aria-activedescendant", items[activeIndex].id);
    if (reveal) {
      const item = items[activeIndex];
      if (item.offsetTop < menu.scrollTop) menu.scrollTop = item.offsetTop;
      else if (
        item.offsetTop + item.offsetHeight >
        menu.scrollTop + menu.clientHeight
      ) {
        menu.scrollTop = item.offsetTop + item.offsetHeight - menu.clientHeight;
      }
    }
  }

  function open() {
    opened = true;
    search = "";
    button.setAttribute("aria-expanded", "true");
    menu.showPopover();
    position();
    menu.scrollTop = Math.max(
      0,
      Math.floor(
        (items[selectedIndex].offsetTop - menu.clientHeight / 2) / 40,
      ) * 40,
    );
    activate(selectedIndex);
  }

  function close(restoreFocus = false) {
    if (!opened) return;
    opened = false;
    menu.hidePopover();
    button.setAttribute("aria-expanded", "false");
    button.removeAttribute("aria-activedescendant");
    if (restoreFocus) button.focus({ preventScroll: true });
  }

  function commit(index) {
    setValue(options[index].value);
    close(true);
    onChange(button.value);
  }

  button.addEventListener("click", () => (opened ? close() : open()));
  button.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "Tab") {
      close();
      return;
    }
    if (event.key === "Escape" && opened) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    const moves = {
      ArrowDown: columns,
      ArrowUp: -columns,
      ArrowLeft: -1,
      ArrowRight: 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      if (!opened) open();
      else activate(activeIndex + moves[event.key]);
    } else if (opened && (event.key === "Home" || event.key === "End")) {
      event.preventDefault();
      activate(event.key === "Home" ? 0 : items.length - 1);
    } else if (opened && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      commit(activeIndex);
    } else if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      if (!opened) open();
      const now = performance.now();
      search = now - lastTyped < 800 ? search + event.key : event.key;
      lastTyped = now;
      const index = options.findIndex((option) =>
        option.label.startsWith(search),
      );
      if (index >= 0) activate(index);
    }
  });
  button.addEventListener("blur", () => close());
  menu.addEventListener("pointerdown", (event) => event.preventDefault());
  menu.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("pointerdown", (event) => {
    if (!button.contains(event.target) && !menu.contains(event.target)) close();
  });
  dialog.addEventListener("close", () => close());
  dialog.addEventListener("cancel", (event) => {
    if (opened) {
      event.preventDefault();
      close(true);
    }
  });
  addEventListener("resize", () => {
    if (opened) position();
  });
  document.addEventListener(
    "scroll",
    (event) => {
      if (opened && event.target !== menu) {
        const rect = button.getBoundingClientRect();
        const sheet = dialog.getBoundingClientRect();
        if (rect.bottom <= sheet.top || rect.top >= sheet.bottom) close();
        else position();
      }
    },
    true,
  );
  setValue(value);
  function setLabels(labels) {
    labels.forEach((text, i) => {
      options[i].label = text;
      items[i].textContent = text;
    });
    label.textContent = options[selectedIndex].label;
    menu.setAttribute("aria-label", button.getAttribute("aria-label"));
    if (opened) position();
  }
  return { setValue, setLabels };
}
