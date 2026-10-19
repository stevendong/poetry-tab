import { httpUrl } from "./custom.js";

// Warm the browser's HTTP cache one image at a time, without retaining decoded
// full-screen bitmaps or competing with the current background download.
export function createBackgroundPrefetch() {
  const completed = new Map();
  let active = null;
  let queue = [];
  let timer;

  function stop() {
    queue = [];
    clearTimeout(timer);
    if (active) {
      active.onload = active.onerror = null;
      active.removeAttribute("src");
      active = null;
    }
  }

  function next() {
    if (navigator.connection?.saveData || document.hidden) {
      stop();
      return;
    }
    if (active || !queue.length) return;
    const src = queue.shift();
    const image = new Image();
    active = image;
    image.referrerPolicy = "no-referrer";
    image.fetchPriority = "low";
    image.decoding = "async";
    function finish(loaded) {
      if (active !== image) return;
      clearTimeout(timer);
      image.onload = image.onerror = null;
      if (loaded) {
        completed.set(src, Date.now());
        if (completed.size > 32) completed.delete(completed.keys().next().value);
      } else image.removeAttribute("src");
      active = null;
      next();
    }
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    timer = setTimeout(() => finish(false), 8000);
    image.src = src;
  }

  return {
    stop,
    warm(sources) {
      if (navigator.connection?.saveData || document.hidden) {
        stop();
        return;
      }
      const wanted = [...new Set(sources.map((src) => httpUrl(src)).filter(Boolean))]
        .filter((src) => !completed.has(src) || Date.now() - completed.get(src) >= 600000)
        .slice(0, 10);
      if (active && wanted.includes(active.getAttribute("src"))) {
        queue = wanted.filter((src) => src !== active.getAttribute("src"));
        return;
      }
      stop();
      queue = wanted;
      next();
    },
  };
}
