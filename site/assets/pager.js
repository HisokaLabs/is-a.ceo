(function (global) {
  var DEFAULT_SIZE = 10;

  function mount(root, options) {
    if (!root) return null;
    var opts = options || {};
    var size = Math.max(1, Math.floor(opts.pageSize) || DEFAULT_SIZE);
    var prev = root.querySelector("[data-pager-prev]");
    var next = root.querySelector("[data-pager-next]");
    var label = root.querySelector("[data-pager-label]");
    var items = [];
    var filter = null;
    var page = 1;

    function matched() {
      if (!filter) return items;
      var out = [];
      for (var i = 0; i < items.length; i++) {
        var keep = false;
        try {
          keep = !!filter(items[i]);
        } catch (err) {
          keep = false;
        }
        if (keep) out.push(items[i]);
      }
      return out;
    }

    function render() {
      var list = matched();
      var total = Math.max(1, Math.ceil(list.length / size));
      if (page > total) page = total;
      if (page < 1) page = 1;

      var start = (page - 1) * size;
      var onPage = list.slice(start, start + size);
      for (var i = 0; i < items.length; i++) {
        var el = items[i];
        var shouldHide = onPage.indexOf(el) === -1;
        if (el.hidden !== shouldHide) el.hidden = shouldHide;
      }

      if (label) label.textContent = page + " / " + total;
      if (prev) prev.disabled = page <= 1;
      if (next) next.disabled = page >= total;
      root.hidden = total <= 1;
      return list.length;
    }

    function step(delta) {
      page += delta;
      render();
    }

    if (prev) prev.addEventListener("click", function () { step(-1); });
    if (next) next.addEventListener("click", function () { step(1); });
    root.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
      }
    });

    return {
      setItems: function (list) {
        items = Array.prototype.slice.call(list || []);
        page = 1;
        return render();
      },
      setFilter: function (fn) {
        filter = fn || null;
        page = 1;
        return render();
      },
      refresh: render,
      page: function () { return page; },
      pageSize: function () { return size; }
    };
  }

  global.Pager = { mount: mount };
})(window);
