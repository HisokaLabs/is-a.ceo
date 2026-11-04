<div align="center">

# is-a.ceo

**Your name, but as a CEO.**

Real DNS records for a landing page, an API, or the repo you will finish this weekend.

[is-a.ceo](https://is-a.ceo) - [Claim a subdomain](https://github.com/HisokaLabs/open-subdomains)

[![Registry check](https://github.com/HisokaLabs/open-subdomains/actions/workflows/check.yml/badge.svg)](https://github.com/HisokaLabs/open-subdomains/actions/workflows/check.yml)
[![Zone status](https://github.com/HisokaLabs/is-a.ceo/actions/workflows/health.yml/badge.svg)](https://github.com/HisokaLabs/is-a.ceo/actions/workflows/health.yml)
[![Site build](https://github.com/HisokaLabs/is-a.ceo/actions/workflows/pages.yml/badge.svg)](https://github.com/HisokaLabs/is-a.ceo/actions/workflows/pages.yml)

</div>

---

The public website for the free subdomain zones run by [Hisoka Labs](https://hisoka.net). This repository is the site only. The DNS registry, the `domains/*.json` files and the DNSControl config live in [HisokaLabs/open-subdomains](https://github.com/HisokaLabs/open-subdomains).

## How it works

```
HisokaLabs/open-subdomains (domains/*.json) -> scripts/build-site.js -> dist/ -> GitHub Pages
```

The registry is checked out as `registry/` next to this repository and the site is rendered from it at build time. Zones come from `domains/_meta.json`, so adding a zone there is all it takes. Nothing is fetched in the browser.

## Run it

```bash
npm run build   # renders dist/ from registry/
npm run dev     # build + serve on http://127.0.0.1:8080
```

The registry is cloned into `registry/` next to this repository, which is where the
build looks by default. Only if yours lives somewhere else, point at it with
`REGISTRY_PATH=/path/to/open-subdomains npm run build`.

`npm run serve -- 3000` serves an existing `dist/` on a specific port. Zero
dependencies. Runs on Node 20 and up; tested on 24.

## Adding a zone

1. Create the zone in Cloudflare and let the API token edit it.
2. Add it to `domains/_meta.json` under `"zones"` in the registry.
3. Optional: give it copy in `site/config.json` under `"zones"`.
4. Push. `pages.yml` rebuilds and the zone appears everywhere: homepage section, checker, status probes, detail pages.

## Pages

| Route | What it does |
| --- | --- |
| `/` | One section per zone with a filterable table, plus the FAQ. |
| `/check` | Availability checker across all zones, client-side. |
| `/status` | Live DNS resolution over DNS-over-HTTPS. |
| `/abuse` | Abuse policy and what happens after a report. |
| `/d/<zone>/<name>` | Per-subdomain detail: owner, description, full record table. |
| `/llms.txt` | Plain-text site description for language models and agents. Generated at build time. |
| `/registry-data.json` | Every zone with its taken, reserved and blocked labels. Powers `/check`. |
| `/domains.json` | Every registered subdomain with owner, repo and record types. |

Terms, privacy and disclaimer live at `/terms`, `/privacy`, `/disclaimer`.

## Layout

| Path | What it is |
| --- | --- |
| `site/` | Templates, `config.json`, `_head.html`, `_header.html`, `_footer.html`. |
| `site/assets/` | `style.css` and the client scripts: theme, nav, count, dns, code, legal. |
| `scripts/` | `build-site.js`, `serve.js`, `probe-zone.js`. |
| `dist/` | Generated output. Never edit by hand. |

## Deployment

`pages.yml` runs on every push to `main`, hourly, and on manual dispatch. It checks out both repositories, builds, and publishes `dist/` to GitHub Pages with the custom domain written from `site/config.json`.

`health.yml` runs every 30 minutes and resolves every name over DNS-over-HTTPS. It fails when a zone stops answering SOA or the site host has no records. A single broken subdomain is reported but does not fail the job.

## License

[ISC](LICENSE), same as the registry.
