(function () {
  var root = document.documentElement;
  var prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
  var THEMES = ["system", "light", "dark"];
  var LABELS = { system: "follow device", light: "light", dark: "dark" };

  function stored() {
    try {
      var value = localStorage.getItem("theme");
      return THEMES.indexOf(value) === -1 ? "system" : value;
    } catch (error) {
      return "system";
    }
  }

  function effective(theme) {
    return theme === "system" ? (prefersDark.matches ? "dark" : "light") : theme;
  }

  function paint(theme) {
    var mode = effective(theme);
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);

    var colorMeta = document.querySelector('meta[name="theme-color"]');
    if (colorMeta) colorMeta.setAttribute("content", mode === "dark" ? "#131310" : "#faf9f5");

    var iconLight = document.querySelector('link[data-icon="light"]');
    var iconDark = document.querySelector('link[data-icon="dark"]');
    if (iconLight && iconDark) {
      iconLight.setAttribute("media", mode === "dark" ? "not all" : "all");
      iconDark.setAttribute("media", mode === "dark" ? "all" : "not all");
    }
  }

  function mark(theme) {
    var toggle = document.querySelector("[data-theme-toggle]");
    if (!toggle) return;
    toggle.setAttribute("data-theme-current", theme);
    toggle.setAttribute("aria-label", "Color theme: " + LABELS[theme]);
    toggle.title = "Color theme: " + LABELS[theme];
  }

  function set(theme, persist) {
    paint(theme);
    mark(theme);
    if (!persist) return;
    try {
      if (theme === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", theme);
    } catch (error) {}
  }

  function next(theme) {
    return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  }

  function bind() {
    var toggle = document.querySelector("[data-theme-toggle]");
    if (toggle) {
      toggle.addEventListener("click", function () {
        set(next(stored()), true);
      });
    }
    set(stored(), false);
  }

  function onDeviceChange() {
    if (stored() === "system") set("system", false);
  }

  if (prefersDark.addEventListener) prefersDark.addEventListener("change", onDeviceChange);
  else if (prefersDark.addListener) prefersDark.addListener(onDeviceChange);

  window.addEventListener("storage", function (event) {
    if (event.key === "theme") set(stored(), false);
  });

  paint(stored());
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
