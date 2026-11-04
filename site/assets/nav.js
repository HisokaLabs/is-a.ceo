(function () {
  var toggle = document.querySelector(".nav-toggle");
  var panel = document.getElementById("primary-nav");
  if (!toggle || !panel) return;

  var desktop = window.matchMedia("(min-width: 761px)");
  var firstLink = panel.querySelector("a");

  function blockScroll(event) {
    if (panel.contains(event.target)) return;
    event.preventDefault();
  }

  function blockKeys(event) {
    if (/^(ArrowUp|ArrowDown|PageUp|PageDown|Home|End|Space)$/.test(event.key) && !panel.contains(event.target)) {
      event.preventDefault();
    }
  }

  function lockScroll(lock) {
    var method = lock ? "addEventListener" : "removeEventListener";
    document[method]("wheel", blockScroll, { passive: false });
    document[method]("touchmove", blockScroll, { passive: false });
    document[method]("keydown", blockKeys, false);
  }

  function isOpen() {
    return toggle.getAttribute("aria-expanded") === "true";
  }

  function setOpen(open, restoreFocus) {
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    panel.classList.toggle("is-open", open);
    document.documentElement.classList.toggle("nav-open", open);
    lockScroll(open);
    if (open) panel.scrollTop = 0;
    if (!open && restoreFocus) toggle.focus();
    if (open && firstLink && !desktop.matches) firstLink.focus({ preventScroll: true });
  }

  toggle.addEventListener("click", function () {
    setOpen(!isOpen(), false);
  });

  panel.addEventListener("click", function (event) {
    if (event.target.closest("a")) setOpen(false, false);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && isOpen()) setOpen(false, true);
  });

  function sync() {
    if (desktop.matches && isOpen()) setOpen(false, false);
  }

  if (desktop.addEventListener) desktop.addEventListener("change", sync);
  else desktop.addListener(sync);

  window.addEventListener("pageshow", function () {
    if (isOpen()) setOpen(false, false);
  });
})();
