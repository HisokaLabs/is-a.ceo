(function () {
  "use strict";

  var toc = document.querySelector(".legal-toc");
  if (!toc) return;

  var links = Array.prototype.slice.call(toc.querySelectorAll("a[data-toc]"));
  if (!links.length) return;

  var bar = toc.querySelector(".legal-progress span");
  var desktop = window.matchMedia("(min-width: 761px)");

  var heads = links
    .map(function (link) {
      return document.getElementById(link.getAttribute("data-toc"));
    })
    .filter(Boolean);

  var current = null;
  var ticking = false;

  function syncCollapse() {
    toc.open = desktop.matches;
  }

  function activate(id) {
    if (id === current) return;
    current = id;
    links.forEach(function (link) {
      var on = link.getAttribute("data-toc") === id;
      if (on) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  }

  function progress() {
    if (!bar) return;
    var doc = document.documentElement;
    var span = doc.scrollHeight - window.innerHeight;
    var ratio = span > 0 ? Math.min(1, Math.max(0, window.scrollY / span)) : 0;
    bar.style.width = (ratio * 100).toFixed(2) + "%";
  }

  function track() {
    ticking = false;
    if (!heads.length) return;
    var line = window.scrollY + (desktop.matches ? 140 : 120);
    var active = heads[0].id;
    for (var i = 0; i < heads.length; i++) {
      if (heads[i].getBoundingClientRect().top + window.scrollY <= line) active = heads[i].id;
    }
    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4) {
      active = heads[heads.length - 1].id;
    }
    activate(active);
    progress();
  }

  function schedule() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(track);
  }

  links.forEach(function (link) {
    link.addEventListener("click", function () {
      if (!desktop.matches) toc.open = false;
    });
  });

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  if (desktop.addEventListener) desktop.addEventListener("change", schedule);
  else if (desktop.addListener) desktop.addListener(schedule);

  if (desktop.addEventListener) desktop.addEventListener("change", syncCollapse);
  else if (desktop.addListener) desktop.addListener(syncCollapse);

  syncCollapse();
  track();
})();
