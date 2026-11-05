#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const SITE_DIR = path.join(ROOT, "site");
const DIST_DIR = path.join(ROOT, "dist");

const REGISTRY_PATH = path.resolve(
  process.argv[2] || process.env.REGISTRY_PATH || path.join(ROOT, "registry")
);

function fail(message) {
  console.error(`build-site: ${message}`);
  process.exit(1);
}

function readJson(file, what) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    fail(`${what}: invalid JSON in ${file} (${err.message})`);
  }
}

function readRegistryMeta() {
  const metaPath = path.join(REGISTRY_PATH, "domains", "_meta.json");
  if (!fs.existsSync(metaPath)) {
    return { zones: [], reserved: [], blocked: [], maxLength: 63 };
  }
  const parsed = readJson(metaPath, "registry meta");
  const meta = parsed._meta || parsed;
  return {
    zones: (meta.zones || []).map((s) => String(s).toLowerCase()),
    maintainers: (meta.maintainers || []).map((s) => String(s).toLowerCase()),
    reserved: (meta.reserved || []).map((s) => String(s).toLowerCase()),
    blocked: (meta.blocked || []).map((s) => String(s).toLowerCase()),
    maxLength: typeof meta.maxLength === "number" ? meta.maxLength : 63,
  };
}

function normalizeRecords(records) {
  if (!records || typeof records !== "object") return {};
  const copy = { ...records };
  if (copy.CNAME != null) {
    const cname = copy.CNAME;
    const targets = Array.isArray(cname) ? cname : [cname];
    copy.CNAME = targets.filter((v) => typeof v === "string" && v.length > 0).slice(0, 1);
  }
  return copy;
}

function readRegistryEntries() {
  const domainsDir = path.join(REGISTRY_PATH, "domains");
  if (!fs.existsSync(domainsDir)) fail(`registry not found at ${REGISTRY_PATH}`);

  const files = fs
    .readdirSync(domainsDir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_") && f !== "SCHEMA.json")
    .sort();

  const byZone = new Map();
  for (const file of files) {
    const parsed = readJson(path.join(domainsDir, file), file);
    (Array.isArray(parsed) ? parsed : [parsed]).forEach((entry) => {
      const zone = String(entry.domain || "").toLowerCase().trim();
      if (!zone) fail(`${file}: entry is missing "domain"`);
      const sub = entry.subdomain;
      if (typeof sub !== "string" || !sub) fail(`${file}: entry is missing "subdomain"`);
      if (!byZone.has(zone)) byZone.set(zone, []);
      byZone.get(zone).push({
        subdomain: sub,
        owner: entry.owner,
        repo: entry.repo || null,
        description: entry.description || "",
        records: normalizeRecords(entry.records),
      });
    });
  }
  return byZone;
}

function readRecordTypeCount() {
  const schemaPath = path.join(REGISTRY_PATH, "domains", "SCHEMA.json");
  if (!fs.existsSync(schemaPath)) return null;
  const schema = readJson(schemaPath, "registry schema");
  const props = schema.properties && schema.properties.records;
  const types = props && props.properties ? Object.keys(props.properties) : null;
  return types ? types.length : null;
}

function assetVersion() {
  const hash = crypto.createHash("sha256");
  const roots = [path.join(SITE_DIR, "assets"), path.join(SITE_DIR, "favicon.svg"), path.join(SITE_DIR, "favicon-dark.svg")];
  const walk = (target) => {
    if (!fs.existsSync(target)) return;
    if (fs.statSync(target).isDirectory()) {
      for (const name of fs.readdirSync(target).sort()) walk(path.join(target, name));
      return;
    }
    hash.update(path.relative(SITE_DIR, target));
    hash.update(fs.readFileSync(target));
  };
  roots.forEach(walk);
  return hash.digest("hex").slice(0, 10);
}

function readConfig() {
  const cfg = readJson(path.join(SITE_DIR, "config.json"), "site config");
  const site = cfg.site || {};
  return {
    siteDomain: site.domain || "is-a.ceo",
    org: site.org || {},
    registry: site.registry || {},
    dns: site.dns || {},
    jurisdiction: site.jurisdiction || "the operator's jurisdiction",
    hero: cfg.hero || {},
    zonesCfg: cfg.zones || {},
  };
}

function zoneBranding(cfg, zone) {
  const override = cfg.zonesCfg[zone] || {};
  const base = cfg.zonesCfg.default || {};
  const apply = (tpl) => String(tpl || "").replace(/\{zone\}/g, zone);
  return {
    tagline: apply(override.tagline || base.tagline || `Free *.{zone} subdomains, claimed with a pull request.`),
    intro: apply(override.intro || base.intro || ""),
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderTemplate(templatePath, vars, options) {
  let html = fs.readFileSync(templatePath, "utf8");
  for (const [key, value] of Object.entries(vars)) {
    const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
    html = html.replace(pattern, value == null ? "" : String(value));
  }
  if (!(options && options.defer)) {
    const left = html.match(/\{\{\s*\w+\s*\}\}/g);
    if (left) fail(`${path.basename(templatePath)}: unresolved placeholder(s) ${left.join(", ")}`);
  }
  return html;
}

const PAGE_META = {
  index: {
    title: "{{site_domain}} - your name, but as a CEO",
    description: "Free {{site_domain}} subdomains, claimed with a pull request. Real DNS for a landing page, an API, or the repo you will finish this weekend. Your name, but as a CEO.",
    nav: "domains",
    path: "/",
    type: "website",
  },
  check: {
    title: "Check a name - {{site_domain}}",
    description: "Check whether a subdomain under the {{org_name}} zones is free before you open a pull request.",
    nav: "check",
    path: "/check",
    type: "website",
  },
  status: {
    title: "Zone status - {{site_domain}}",
    description: "Live resolution status for every zone and registered subdomain under {{org_name}}, queried over DNS-over-HTTPS.",
    nav: "status",
    path: "/status",
    type: "website",
  },
  abuse: {
    title: "Abuse policy - {{site_domain}}",
    description: "How to report abuse of a subdomain under the {{org_name}} zones, and what happens after you report it.",
    nav: "abuse",
    path: "/abuse",
    type: "website",
  },
  terms: {
    title: "Terms of Service - {{site_domain}}",
    description: "The terms that apply when you claim or use a subdomain under the {{org_name}} zones.",
    nav: "terms",
    path: "/terms",
    type: "website",
    legal: true,
  },
  privacy: {
    title: "Privacy Policy - {{site_domain}}",
    description: "What this site collects, what it does not collect, and where the little data it handles goes.",
    nav: "privacy",
    path: "/privacy",
    type: "website",
    legal: true,
  },
  disclaimer: {
    title: "Disclaimer - {{site_domain}}",
    description: "What a free delegated subdomain is and is not, and what {{org_name}} does and does not control.",
    nav: "disclaimer",
    path: "/disclaimer",
    type: "website",
    legal: true,
  },
  domain: {
    title: "{{domain}} - {{site_domain}}",
    description: "{{domain}}: {{description}} Registered by {{owner}} under the {{zone}} zone.",
    nav: "domains",
    type: "article",
  },
  404: {
    title: "Page not found - {{site_domain}}",
    description: "That address is not part of {{site_domain}}. Check whether the name you wanted is free, or browse the registered subdomains.",
    nav: null,
    path: "/404",
    type: "website",
    robots: "noindex, follow",
  },
};

function renderPartial(name, vars) {
  return renderTemplate(path.join(SITE_DIR, `_${name}.html`), vars);
}

function markCurrent(html, pageKey) {
  if (!pageKey) return html;
  const pattern = new RegExp(`(<a [^>]*\\bdata-(?:nav|legal)="${pageKey}"[^>]*)>`);
  return html.replace(pattern, '$1 aria-current="page">');
}

function slugifyHeading(text) {
  return String(text)
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z]+;/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildLegalDoc(html, pageKey) {
  const used = new Set();
  const sections = [];
  let index = 0;
  const numbered = html.replace(/<h2>([\s\S]*?)<\/h2>/g, (_, inner) => {
    index++;
    const label = inner.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    let id = slugifyHeading(label) || `section-${index}`;
    while (used.has(id)) id = `${id}-${index}`;
    used.add(id);
    const num = String(index).padStart(2, "0");
    sections.push({ id, label, num });
    return (
      `<h2 id="${id}"><span class="section-num" aria-hidden="true">${num}</span>` +
      `<span class="section-label">${inner}</span></h2>`
    );
  });
  if (sections.length === 0) fail(`${pageKey}: legal page has no <h2> sections`);
  const toc = sections
    .map(
      (s) =>
        `<li><a href="#${s.id}" data-toc="${s.id}"><span class="toc-num">${s.num}</span><span>${s.label}</span></a></li>`
    )
    .join("\n          ");
  const out = numbered
    .replace("{{legal_toc}}", () => toc)
    .replace("{{legal_count}}", () => String(sections.length));
  const left = out.match(/\{\{\s*\w+\s*\}\}/g);
  if (left) fail(`${pageKey}: unresolved placeholder(s) ${left.join(", ")}`);
  return out;
}

function pageUrl(siteDomain, pagePath) {
  return `https://${siteDomain}${pagePath}`;
}

function jsonLd(cfg, meta, page) {
  const base = `https://${cfg.siteDomain}`;
  const site = {
    "@type": "WebSite",
    "@id": `${base}/#website`,
    url: `${base}/`,
    name: cfg.siteDomain,
    description: `Free ${cfg.siteDomain} subdomains, claimed with a pull request.`,
    inLanguage: "en",
    publisher: { "@type": "Organization", name: cfg.org.name || "the operator", url: cfg.org.url || base },
  };
  if (meta.type === "article") {
    return {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: page.page_title,
      description: page.page_description,
      url: page.page_url,
      mainEntityOfPage: page.page_url,
      isPartOf: site,
    };
  }
  const node = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: page.page_title,
    description: page.page_description,
    url: page.page_url,
    isPartOf: site,
  };
  if (meta.legal) node.about = { "@type": "Thing", name: renderTemplateText(meta.title.split(" - ")[0], page) };
  if (meta.path === "/") node.mainEntity = site;
  return node;
}

function renderPage(name, vars) {
  const meta = PAGE_META[name];
  if (!meta) fail(`no PAGE_META entry for ${name}`);
  const shell = renderTemplate(path.join(SITE_DIR, `${name}.html`), vars, { defer: true });
  const page = {
    ...vars,
    page_title: renderTemplateText(meta.title, vars),
    page_description: renderTemplateText(meta.description, vars),
    page_url: vars.page_url || pageUrl(vars.site_domain, meta.path || "/"),
    page_robots: vars.page_robots || meta.robots || "index, follow, max-image-preview:large",
    og_type: meta.type || "website",
    og_image: `https://${vars.site_domain}/og.png`,
  };
  page.page_jsonld = JSON.stringify(jsonLd({ siteDomain: vars.site_domain, org: { name: vars.org_name, url: vars.org_url } }, meta, page));
  const withPartials = shell
    .replace("{{head}}", () => renderPartial("head", page))
    .replace("{{header}}", () => markCurrent(renderPartial("header", page), meta.nav))
    .replace("{{footer}}", () => markCurrent(renderPartial("footer", page), meta.nav));
  return meta.legal ? buildLegalDoc(withPartials, name) : withPartials;
}

function renderTemplateText(template, vars) {
  let text = template;
  for (const [key, value] of Object.entries(vars)) {
    text = text.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"), value == null ? "" : String(value));
  }
  return text;
}

function pageSlug(sub, used) {
  let slug = sub === "@" ? "" : sub.replace(/\*/g, "wildcard");
  if (!slug) return null;
  let candidate = slug;
  let n = 2;
  while (used.has(candidate)) candidate = `${slug}-${n++}`;
  used.add(candidate);
  return candidate;
}

function zoneAnchor(zone) {
  return zone.replace(/\./g, "-");
}

function recordSummary(records) {
  const parts = [];
  if (records.A && records.A.length) parts.push(`${records.A.length} A`);
  if (records.AAAA && records.AAAA.length) parts.push(`${records.AAAA.length} AAAA`);
  if (records.CNAME && records.CNAME.length) parts.push("CNAME");
  if (records.TXT && records.TXT.length) parts.push("TXT");
  if (records.MX && records.MX.length) parts.push("MX");
  if (records.NS && records.NS.length) parts.push("NS");
  if (records.SRV && records.SRV.length) parts.push("SRV");
  if (records.CAA && records.CAA.length) parts.push("CAA");
  if (records.PTR && records.PTR.length) parts.push("PTR");
  return parts.join(" · ") || "GitHub Pages default";
}

function recordRows(records) {
  const rows = [];
  const push = (type, value) =>
    rows.push(`<tr><td class="mono">${escapeHtml(type)}</td><td class="mono">${escapeHtml(value)}</td></tr>`);

  (records.A || []).forEach((v) => push("A", v));
  (records.AAAA || []).forEach((v) => push("AAAA", v));
  (records.CNAME || []).forEach((v) => push("CNAME", v));
  (records.TXT || []).forEach((v) => push("TXT", v.length > 60 ? `${v.slice(0, 57)}…` : v));
  (records.MX || []).forEach((mx) => push("MX", `${mx.priority} ${mx.target}`));
  (records.NS || []).forEach((v) => push("NS", v));
  (records.SRV || []).forEach((s) => push("SRV", `${s.priority} ${s.weight} ${s.port} ${s.target}`));
  (records.CAA || []).forEach((c) => push("CAA", `${c.flag} ${c.tag} ${c.value}`));
  (records.PTR || []).forEach((v) => push("PTR", v));

  if (rows.length === 0) {
    rows.push('<tr><td class="mono">A</td><td class="mono">185.199.108.153</td></tr>');
    rows.push('<tr><td class="mono">A</td><td class="mono">185.199.109.153</td></tr>');
    rows.push('<tr><td class="mono">A</td><td class="mono">185.199.110.153</td></tr>');
    rows.push('<tr><td class="mono">A</td><td class="mono">185.199.111.153</td></tr>');
    rows.push('<tr><td class="mono">AAAA</td><td class="mono">2606:50c1:8000::153</td></tr>');
  }
  return rows.join("\n");
}

function claimHref(cfg, zone, subdomain) {
  const sub = subdomain || "your-name";
  const value = JSON.stringify(
    {
      domain: zone,
      subdomain: sub,
      owner: "your-github-username",
      repo: "github.com/you/your-repo",
      description: "What this subdomain is for.",
    },
    null,
    2
  );
  const repo = cfg.registry.repo;
  const file = `${cfg.registry.dir || "domains"}/${sub}.${zone}.json`;
  return `https://github.com/${repo}/new/main?filename=${encodeURIComponent(file)}&value=${encodeURIComponent(value)}`;
}

function statsHtml(zones, totalCount, recordTypes) {
  const items = [
    [`<b data-count-to="${totalCount}">0</b>`, `subdomain${totalCount === 1 ? "" : "s"} registered`],
    [`<b data-count-to="0">0</b>`, "cost, forever"],
  ];
  if (zones.length > 1) items.splice(1, 0, [`<b data-count-to="${zones.length}">0</b>`, `zone${zones.length === 1 ? "" : "s"}`]);
  items.push([`<b data-count-to="${recordTypes || 9}">0</b>`, "record types supported"]);
  return items.map(([b, label]) => `      <div class="stat">${b}<span>${label}</span></div>`).join("\n");
}

function heroHtml(cfg, zones, totalCount, recordTypes) {
  const variant = zones.length === 1 ? "single" : "multi";
  const hero = cfg.hero[variant] || {};
  const zone = zones[0];
  const apply = (tpl) => String(tpl || "").replace(/\{zone\}/g, zone);

  const titlePlain = hero.titlePlain || "Your name,";
  const titleAccent = hero.titleAccent || (variant === "single" ? "but free." : "but free.");
  const intro = apply(
    hero.intro ||
      zoneBranding(cfg, zone).intro ||
      "Free subdomains for the thing you are shipping, claimed with a pull request."
  );

  const ctas = [];
  if (variant === "single") {
    ctas.push(
      [`Claim yours`, claimHref(cfg, zone), true],
      [`See an example`, `https://github.com/${cfg.registry.repo}/blob/main/${cfg.registry.dir || "domains"}/_example.json`, false]
    );
  } else {
    ctas.push(
      [`Check a name`, `/check`, true],
      [`Browse the zones`, `#domains`, false]
    );
  }
  const ctaRow = ctas
    .map(([label, href, primary]) => `    <a class="cta${primary ? "" : " secondary"}" href="${escapeHtml(href)}">${label}</a>`)
    .join("\n");

  return {
    title: `${escapeHtml(titlePlain)} <span>${escapeHtml(titleAccent)}</span>`,
    intro: escapeHtml(intro),
    ctas: ctaRow,
    stats: statsHtml(zones, totalCount, recordTypes),
  };
}

function zoneSectionHtml(cfg, zone, allEntries) {
  const anchor = zoneAnchor(zone);
  const brand = zoneBranding(cfg, zone);
  const entries = allEntries.filter((e) => e.subdomain !== "@");
  const claimable = entries.length;

  const rows = entries
    .slice()
    .sort((a, b) => a.subdomain.localeCompare(b.subdomain))
    .map((d) => {
      const domain = `${d.subdomain}.${zone}`;
      const repo = d.repo
        ? `<a href="https://${escapeHtml(d.repo)}" rel="noopener nofollow">${escapeHtml(d.repo)}</a>`
        : `<span class="muted">none</span>`;
      return `<tr>
  <td data-label="Subdomain"><a class="mono strong" href="https://${escapeHtml(domain)}">${escapeHtml(domain)}</a></td>
  <td data-label="Owner">${escapeHtml(d.owner)}</td>
  <td data-label="Description">${escapeHtml(d.description || "")}</td>
  <td class="muted small" data-label="Records">${escapeHtml(recordSummary(d.records))}</td>
  <td class="small" data-label="Repo">${repo}</td>
</tr>`;
    })
    .join("\n");

  const emptyState = `<tr><td colspan="5" class="empty">No subdomains claimed yet. Be the first: check a name below, then open a pull request.</td></tr>`;

  return `  <div class="zone-section" id="zone-${anchor}">
    <h2 id="${anchor}" class="zone-title"><span class="mono">*.${escapeHtml(zone)}</span> <span class="zone-count">${claimable} registered</span></h2>
    <p class="lead">${escapeHtml(brand.tagline)}</p>
    <div class="table-filter">
      <input type="search" id="filter-${anchor}" placeholder="Filter by subdomain, owner, or description…"
             autocapitalize="none" autocorrect="off" spellcheck="false" aria-label="Filter ${escapeHtml(zone)} subdomains">
      <span class="count" id="filter-count-${anchor}"></span>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Subdomain</th>
            <th>Owner</th>
            <th>Description</th>
            <th>Records</th>
            <th>Repo</th>
          </tr>
        </thead>
        <tbody id="domain-rows-${anchor}">
${rows || emptyState}
        </tbody>
      </table>
    </div>
    <nav class="pager" data-pager hidden aria-label="Pages for ${escapeHtml(zone)}">
      <span class="pager-status mono" data-pager-label>1 / 1</span>
      <div class="pager-controls">
        <button type="button" class="pager-btn" data-pager-prev aria-label="Previous page">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button type="button" class="pager-btn" data-pager-next aria-label="Next page">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </nav>
    <p class="zone-claim">
      Want one? <a href="/check?zone=${encodeURIComponent(zone)}">Check if your name is free</a>, then
      <a href="${escapeHtml(claimHref(cfg, zone))}">open a pull request</a>.
    </p>
  </div>`;
}

function buildIndex(cfg, zones, byZone, totalCount, recordTypes) {
  const sections = zones.map((zone) => zoneSectionHtml(cfg, zone, byZone.get(zone) || [])).join("\n");
  const hero = heroHtml(cfg, zones, totalCount, recordTypes);

  return renderPage("index", {
    ...commonVars(cfg),
    zone_example: zones[0],
    zone_default: zones[0],
    hero_title: hero.title,
    hero_intro: hero.intro,
    hero_ctas: hero.ctas,
    stats_row: hero.stats,
    zone_sections: sections,
  });
}

function buildDomainPage(cfg, zone, entry, slug) {
  const domain = `${entry.subdomain}.${zone}`;
  const repo = entry.repo
    ? `<a href="https://${escapeHtml(entry.repo)}" rel="noopener nofollow">${escapeHtml(entry.repo)}</a>`
    : `<span class="muted">none</span>`;
  return renderPage("domain", {
    ...commonVars(cfg),
    page_url: pageUrl(cfg.siteDomain, `/d/${zone}/${slug}`),
    domain: escapeHtml(domain),
    subdomain: escapeHtml(entry.subdomain),
    zone: escapeHtml(zone),
    zone_anchor: zoneAnchor(zone),
    owner: escapeHtml(entry.owner),
    description: escapeHtml(entry.description || "No description provided."),
    repo,
    record_rows: recordRows(entry.records),
  });
}

function buildRegistryData(zones, byZone, meta) {
  return `${JSON.stringify(
    {
      zones: zones.map((zone) => ({
        name: zone,
        maxLength: meta.maxLength,
        reserved: meta.reserved,
        blocked: meta.blocked,
        taken: takenNames(byZone.get(zone) || []),
      })),
    },
    null,
    2
  )}\n`;
}

function takenNames(entries) {
  const taken = [];
  for (const e of entries) {
    if (e.subdomain === "@") continue;
    taken.push(e.subdomain);
    if (e.subdomain.startsWith("*.")) taken.push(e.subdomain.slice(2));
  }
  return taken.sort();
}

function buildDomainsJson(zones, byZone, slugsByZone) {
  const all = [];
  for (const zone of zones) {
    for (const e of byZone.get(zone) || []) {
      const slug = slugsByZone.get(zone).get(e.subdomain);
      all.push({
        domain: e.subdomain === "@" ? zone : `${e.subdomain}.${zone}`,
        zone,
        subdomain: e.subdomain,
        owner: e.owner,
        repo: e.repo,
        description: e.description,
        record: e.records,
        page: slug ? `d/${zone}/${slug}.html` : null,
      });
    }
  }
  all.sort((a, b) => a.domain.localeCompare(b.domain));
  return `${JSON.stringify(all, null, 2)}\n`;
}

function buildSitemap(cfg, zones, byZone, slugsByZone) {
  const base = `https://${cfg.siteDomain}`;
  const urls = [
    `${base}/`,
    `${base}/check`,
    `${base}/status`,
    `${base}/abuse`,
    `${base}/terms`,
    `${base}/privacy`,
    `${base}/disclaimer`,
  ];
  for (const zone of zones) {
    for (const [sub, slug] of slugsByZone.get(zone)) {
      urls.push(`${base}/d/${zone}/${slug}`);
    }
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((u) => `  <url><loc>${escapeHtml(u)}</loc></url>`),
    "</urlset>",
    "",
  ].join("\n");
}

function buildSchema(cfg) {
  const schemaPath = path.join(REGISTRY_PATH, "domains", "SCHEMA.json");
  if (!fs.existsSync(schemaPath)) return null;
  const schema = readJson(schemaPath, "registry schema");
  schema.$id = `https://${cfg.siteDomain}/domains.schema.json`;
  return JSON.stringify(schema, null, 2) + "\n";
}

function buildRobots(cfg) {
  return [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: https://${cfg.siteDomain}/sitemap.xml`,
    "",
  ].join("\n");
}

function buildLlmsTxt(cfg, zones, byZone, slugsByZone, totalCount) {
  const base = `https://${cfg.siteDomain}`;
  const repo = cfg.registry.repo;
  const dir = cfg.registry.dir || "domains";
  const lines = [
    `# ${cfg.siteDomain}`,
    "",
    `> Free ${cfg.siteDomain} subdomains for developers. Pick a name, add one JSON file to the ${repo} registry, open a pull request. Nothing is paid, nothing expires, no account is required. The site is a static render of that registry.`,
    "",
    "This file describes the site for language models and agents. It is plain text, generated at build time from the same registry the pages are rendered from, so it never drifts from what the site actually contains.",
    "",
    "## What this is",
    "",
    `- A free subdomain service. Zone${zones.length === 1 ? "" : "s"}: ${zones.join(", ")}.`,
    `- ${totalCount} subdomain${totalCount === 1 ? "" : "s"} currently registered.`,
    "- Every registration is one JSON file in a public GitHub repository.",
    "- The DNS is real. Records are pushed with DNSControl, not proxied through a redirect.",
    `- Operated by ${cfg.org.name}.`,
    "",
    "## What this is not",
    "",
    "- Not a hosting provider. You get a DNS name and point it wherever you like.",
    "- Not a domain registrar. The apex domain belongs to the operator.",
    "- Not an email provider, not a CDN, not an analytics service.",
    `- Not affiliated with any company whose name appears as a reserved or blocked label.`, 
    "",
    "## Pages",
    "",
    `- [Home](${base}/): what the service is, the live subdomain list, the rules, the FAQ.`,
    `- [Check](${base}/check): type a name, get free / taken / reserved / blocked before opening a pull request. Reads /registry-data.json in the browser.`,
    `- [Status](${base}/status): live DNS resolution for every registered name, resolved in the browser against DNS-over-HTTPS.`,
    `- [Abuse](${base}/abuse): how to report a subdomain, and what happens after.`,
    `- [Terms](${base}/terms), [Privacy](${base}/privacy), [Disclaimer](${base}/disclaimer): the legal pages.`,
    `- [Subdomain detail](${base}/d/${zones[0]}/${slugsByZone.get(zones[0])?.values().next().value || "name"}): one page per registered name, with owner, repo, DNS records and purpose.`,
    "",
    "## Machine-readable endpoints",
    "",
    `- ${base}/registry-data.json: every zone with its taken, reserved and blocked labels. This is what the checker queries. Shape: { zones: [{ name, taken[], reserved[], blocked[], maxLength }] }.`,
    `- ${base}/domains.json: every registered subdomain with owner, repo, description and DNS record types.`,
    `- ${base}/domains.schema.json: JSON Schema (draft-07) for a single registry entry, the same file the registry repository validates against. Its \`$id\` is this URL, so an entry can point at ${base}/domains.schema.json and be checked by any JSON Schema validator.`,
    `- ${base}/sitemap.xml: every indexable URL.`,
    `- ${base}/llms.txt: this file.`,
    "",
    "## How to claim a name",
    "",
    "1. Check the name is free on /check, or read /registry-data.json.",
    `2. Add a file at ${dir}/<subdomain>.<zone>.json to https://github.com/${repo}.`,
    "3. Fields: domain, subdomain, owner (GitHub username), repo, description, and optionally records.",
    "4. Open a pull request. CI validates the file, checks the label against the reserved and blocked lists, and previews the DNS diff.",
    "5. On merge the record is pushed and the site rebuilds.",
    "",
    "## Rules",
    "",
    "- Lowercase letters, digits and hyphens. Each label starts and ends with a letter or digit.",
    "- Records are optional; omit them entirely for the GitHub Pages default.",
    "- records.CNAME is a single target: a bare string, or a one-item array for older files. A trailing dot is optional. DNS forbids a CNAME sharing its name with A, AAAA or TXT records, and a CNAME cannot target its own name or the zone apex. Put verification TXT records on their own dotted name.",
    "- A leading underscore is allowed per label, for records like _acme-challenge.",
    "- Reserved and blocked labels cannot be claimed. Brand and impersonation risk names are blocked.",
    "- A public name must not point into a private network.",
    "- Claims that look like phishing, malware or impersonation are removed.",
    "",
    "## Zones",
    "",
    ...zones.map((z) => {
      const count = (byZone.get(z) || []).filter((e) => e.subdomain !== "@").length;
      return `- ${z}: ${count} registered name${count === 1 ? "" : "s"}.`;
    }),
    "",
    "## Contact",
    "",
    `- Abuse reports and general questions: ${cfg.org.email}`,
    `- Company: ${cfg.org.name} (${cfg.org.url})`,
    "",
  ];
  return lines.join("\n");
}

function buildStaticPage(cfg, name, extraVars) {
  return renderPage(name, {
    ...commonVars(cfg),
    zone_example: extraVars.zone_example,
    zone_default: extraVars.zone_default,
    zone_count: extraVars.zone_count,
    domain_count: extraVars.domain_count,
  });
}

function commonVars(cfg) {
  const [brandLead, ...rest] = cfg.siteDomain.split(".");
  return {
    site_domain: cfg.siteDomain,
    brand_html: `<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32"><rect width="32" height="32" rx="8"/><path class="brand-crown" d="M8.5 21.6v-8.2l3.9 3.3L16 10l3.6 6.7 3.9-3.3v8.2z"/></svg></span><span class="brand-word">${escapeHtml(brandLead)}<b>.${escapeHtml(rest.join("."))}</b></span>`,
    org_name: escapeHtml(cfg.org.name || "the operator"),
    org_url: escapeHtml(cfg.org.url || "#"),
    contact_email: escapeHtml(cfg.org.email || ""),
    dns_tool: escapeHtml(cfg.dns.tool || "DNSControl"),
    actions_repo: escapeHtml(cfg.dns.actionsRepo || ""),
    actions_version: escapeHtml(cfg.dns.actionsVersion || ""),
    registry_repo: escapeHtml(cfg.registry.repo || ""),
    registry_dir: escapeHtml(cfg.registry.dir || "domains"),
    jurisdiction: escapeHtml(cfg.jurisdiction),
    year: new Date().getFullYear(),
    asset_version: assetVersion(),
  };
}

function main() {
  const cfg = readConfig();
  const meta = readRegistryMeta();
  const byZone = readRegistryEntries();
  console.log(`build-site: reading registry from ${REGISTRY_PATH}`);

  const zones = Array.from(new Set([...meta.zones, ...byZone.keys()])).sort();
  if (zones.length === 0) fail("no zones found: add one to the registry's domains/_meta.json");

  const slugsByZone = new Map();
  let totalCount = 0;
  for (const zone of zones) {
    const slugs = new Map();
    const used = new Set();
    for (const e of byZone.get(zone) || []) {
      if (e.subdomain === "@") continue;
      totalCount++;
      const slug = pageSlug(e.subdomain, used);
      if (slug) slugs.set(e.subdomain, slug);
    }
    slugsByZone.set(zone, slugs);
  }

  if (fs.existsSync(DIST_DIR)) fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });

  for (const name of ["assets", "favicon.svg", "favicon-dark.svg", "og.png"]) {
    const src = path.join(SITE_DIR, name);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(DIST_DIR, name);
    if (fs.statSync(src).isDirectory()) {
      fs.cpSync(src, dest, { recursive: true });
    } else {
      fs.copyFileSync(src, dest);
    }
  }

  fs.writeFileSync(path.join(DIST_DIR, "CNAME"), `${cfg.siteDomain}\n`);
  fs.writeFileSync(path.join(DIST_DIR, "robots.txt"), buildRobots(cfg));
  const schema = buildSchema(cfg);
  if (schema) fs.writeFileSync(path.join(DIST_DIR, "domains.schema.json"), schema);
  fs.writeFileSync(
    path.join(DIST_DIR, "llms.txt"),
    buildLlmsTxt(cfg, zones, byZone, slugsByZone, totalCount)
  );

  fs.writeFileSync(path.join(DIST_DIR, "index.html"), buildIndex(cfg, zones, byZone, totalCount, readRecordTypeCount()));

  const pageDir = path.join(DIST_DIR, "d");
  fs.mkdirSync(pageDir, { recursive: true });
  for (const zone of zones) {
    const zoneDir = path.join(pageDir, zone);
    fs.mkdirSync(zoneDir, { recursive: true });
    for (const e of byZone.get(zone) || []) {
      const slug = slugsByZone.get(zone).get(e.subdomain);
      if (!slug) continue;
      fs.writeFileSync(path.join(zoneDir, `${slug}.html`), buildDomainPage(cfg, zone, e, slug));
    }
  }

  fs.writeFileSync(path.join(DIST_DIR, "registry-data.json"), buildRegistryData(zones, byZone, meta));
  fs.writeFileSync(path.join(DIST_DIR, "domains.json"), buildDomainsJson(zones, byZone, slugsByZone));
  fs.writeFileSync(path.join(DIST_DIR, "check.html"), buildStaticPage(cfg, "check", {
    zone_example: zones[0],
    zone_default: zones[0],
    zone_count: zones.length,
    domain_count: totalCount,
  }));
  fs.writeFileSync(path.join(DIST_DIR, "status.html"), buildStaticPage(cfg, "status", {
    zone_example: zones[0],
    zone_default: zones[0],
    zone_count: zones.length,
    domain_count: totalCount,
  }));
  fs.writeFileSync(path.join(DIST_DIR, "abuse.html"), buildStaticPage(cfg, "abuse", {
    zone_example: zones[0],
    zone_default: zones[0],
    zone_count: zones.length,
    domain_count: totalCount,
  }));
  for (const legal of ["terms", "privacy", "disclaimer"]) {
    fs.writeFileSync(path.join(DIST_DIR, `${legal}.html`), buildStaticPage(cfg, legal, {
      zone_example: zones[0],
      zone_default: zones[0],
      zone_count: zones.length,
      domain_count: totalCount,
    }));
  }

  fs.writeFileSync(path.join(DIST_DIR, "sitemap.xml"), buildSitemap(cfg, zones, byZone, slugsByZone));
  fs.writeFileSync(path.join(DIST_DIR, "404.html"), buildStaticPage(cfg, "404", {
    zone_example: zones[0],
    zone_default: zones[0],
    zone_count: zones.length,
    domain_count: totalCount,
  }));

  const subPages = Array.from(slugsByZone.values()).reduce((n, s) => n + s.size, 0);
  console.log(
    `build-site: ${zones.length} zone(s), ${totalCount} public subdomain(s), ` +
      `${subPages} detail page(s) rendered into dist/`
  );
}

main();
