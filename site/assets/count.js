(function (global) {
  var reduceQuery = global.matchMedia ? global.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var frames = new WeakMap();
  var numberFormat = new Intl.NumberFormat();

  function reduced() {
    return !!(reduceQuery && reduceQuery.matches);
  }

  function sanitize(value) {
    var n = Number(value);
    if (!isFinite(n)) return null;
    return Math.max(0, Math.round(n));
  }

  function format(value) {
    return numberFormat.format(value);
  }

  function label(el) {
    return el.dataset.countPrefix || "";
  }

  function reserve(el, text) {
    var needed = label(el).length + text.length;
    var current = Number(el.dataset.countCh || 0);
    if (needed <= current) return;
    el.dataset.countCh = String(needed);
    el.style.minInlineSize = needed + "ch";
  }

  function cancel(el) {
    var id = frames.get(el);
    if (id) global.cancelAnimationFrame(id);
    frames.delete(el);
  }

  function hold(el, maxValue) {
    var n = sanitize(maxValue);
    if (n === null) return;
    reserve(el, format(n));
  }

  function set(el, value) {
    var n = sanitize(value);
    if (n === null) return;
    cancel(el);
    var text = format(n);
    reserve(el, text);
    el.textContent = label(el) + text;
    el.dataset.countValue = String(n);
  }

  function duration(value) {
    var magnitude = Math.log10(Math.max(1, value));
    return Math.round(Math.min(1500, 380 + magnitude * 260));
  }

  function to(el, value, options) {
    var target = sanitize(value);
    if (!target) {
      set(el, value);
      return;
    }
    if (reduced() || document.hidden || !global.requestAnimationFrame) {
      set(el, target);
      return;
    }

    cancel(el);
    var from = sanitize(el.dataset.countValue || el.textContent);
    if (from === null) from = 0;
    if (from === target) {
      set(el, target);
      return;
    }

    var span = duration(target);
    var start = null;
    reserve(el, format(target));

    function step(now) {
      if (start === null) start = now;
      var progress = Math.min(1, (now - start) / span);
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = Math.round(from + (target - from) * eased);
      el.textContent = label(el) + format(current);
      el.dataset.countValue = String(current);
      if (progress < 1) {
        frames.set(el, global.requestAnimationFrame(step));
      } else {
        frames.delete(el);
        set(el, target);
      }
    }

    frames.set(el, global.requestAnimationFrame(step));
  }

  function scan(root) {
    var scope = root || document;
    var nodes = Array.prototype.slice.call(scope.querySelectorAll("[data-count-to]:not([data-count-live])"));
    if (!nodes.length) return;
    if (!("IntersectionObserver" in global)) {
      nodes.forEach(function (el) {
        el.textContent = label(el) + format(sanitize(el.dataset.countTo) || 0);
        to(el, el.dataset.countTo);
      });      return;
    }
    var observer = new IntersectionObserver(function (records) {
      records.forEach(function (record) {
        if (!record.isIntersecting) return;
        observer.unobserve(record.target);
        var el = record.target;
        el.textContent = label(el) + format(0);
        to(el, el.dataset.countTo);
      });
    }, { threshold: 0.4 });
    nodes.forEach(function (el) { observer.observe(el); });
  }

  global.CountUp = { set: set, to: to, scan: scan, hold: hold, format: format };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { scan(); });
  } else {
    scan();
  }
})(window);
