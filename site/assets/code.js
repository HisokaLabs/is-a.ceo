(function (global) {
  var CLIPBOARD = global.navigator && global.navigator.clipboard;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function span(cls, value) {
    return '<span class="' + cls + '">' + escapeHtml(value) + "</span>";
  }

  function highlightJson(source) {
    var pattern = /("(?:[^"\\]|\\.)*"\s*:)|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?)|([{}\[\],:])|(\s+)|([^"{}\[\],:\s]+)/g;
    return String(source).replace(pattern, function (match, key, str, num, punc, space, word) {
      if (key) return span("tok-key", key.replace(/\s*:\s*$/, "")) + span("tok-punc", ":");
      if (str) return span("tok-str", str);
      if (num) return span("tok-num", num);
      if (punc) return span("tok-punc", punc);
      if (space) return space;
      return escapeHtml(word || match);
    });
  }

  function highlight(code) {
    var lang = code.dataset.lang;
    if (!lang) return;
    code.dataset.codeText = code.textContent;
    if (lang === "json") code.innerHTML = highlightJson(code.dataset.codeText);
  }

  function fallbackCopy(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (err) {
      ok = false;
    }
    document.body.removeChild(area);
    return ok;
  }

  function flash(button, label) {
    var text = button.querySelector("[data-code-label]") || button;
    if (!button.dataset.codeIdle) button.dataset.codeIdle = text.textContent;
    text.textContent = label;
    button.dataset.copied = label === "Copied";
    global.clearTimeout(button.codeTimer);
    button.codeTimer = global.setTimeout(function () {
      text.textContent = button.dataset.codeIdle;
      button.dataset.copied = "false";
    }, 1800);
  }

  function copy(button) {
    var block = button.closest("[data-code-block]");
    if (!block) return;
    var code = block.querySelector("code");
    if (!code) return;
    var text = code.dataset.codeText || code.textContent;
    if (!CLIPBOARD || !CLIPBOARD.writeText) {
      flash(button, fallbackCopy(text) ? "Copied" : "Press Ctrl+C");
      return;
    }
    CLIPBOARD.writeText(text).then(function () {
      flash(button, "Copied");
    }, function () {
      flash(button, fallbackCopy(text) ? "Copied" : "Press Ctrl+C");
    });
  }

  function init() {
    var codes = Array.prototype.slice.call(document.querySelectorAll("[data-lang]"));
    codes.forEach(highlight);
    var buttons = Array.prototype.slice.call(document.querySelectorAll("[data-code-copy]"));
    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        copy(button);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.CodeBlock = { highlight: highlight, highlightJson: highlightJson, copy: copy };
})(window);
