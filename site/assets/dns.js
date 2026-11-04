(function (global) {
  var DOH = "https://cloudflare-dns.com/dns-query";
  var TYPES = ["A", "AAAA", "CNAME", "TXT"];

  function query(name, type) {
    var url = DOH + "?name=" + encodeURIComponent(name) + "&type=" + encodeURIComponent(type);
    return fetch(url, { headers: { accept: "application/dns-json" }, cache: "no-store" })
      .then(function (res) { return res.ok ? res.json() : null; })
      .catch(function () { return null; });
  }

  function probe(domain) {
    var index = 0;
    function attempt() {
      if (index >= TYPES.length) return { ok: false, type: null, answer: "" };
      var type = TYPES[index++];
      return query(domain, type).then(function (json) {
        if (json && json.Answer && json.Answer.length) {
          return { ok: true, type: type, answer: json.Answer[0].data };
        }
        return attempt();
      });
    }
    return Promise.resolve()
      .then(attempt)
      .then(null, function () { return { ok: false, type: null, answer: "" }; });
  }

  function resolvePool(entries, concurrency, onResult) {
    var tally = { total: entries.length, done: 0, ok: 0, fail: 0 };
    var cursor = 0;
    var lanes = Math.max(1, Math.min(concurrency || 4, entries.length || 1));

    function next() {
      if (cursor >= entries.length) return Promise.resolve();
      var entry = entries[cursor++];
      return probe(entry.domain).then(function (state) {
        if (state.ok) { tally.ok++; } else { tally.fail++; }
        tally.done++;
        if (onResult) onResult(entry, state, tally);
        return next();
      });
    }

    var running = [];
    for (var i = 0; i < lanes; i++) running.push(next());
    return Promise.all(running).then(function () { return tally; });
  }

  global.DohProbe = { query: query, probe: probe, resolvePool: resolvePool };
})(window);
