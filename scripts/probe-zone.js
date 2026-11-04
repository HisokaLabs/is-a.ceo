#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DOH = "https://cloudflare-dns.com/dns-query";
const TIMEOUT_MS = 8000;

// CI checks the registry out as `registry/` next to this repository;
// override with REGISTRY_PATH or the first CLI argument.
const REGISTRY_PATH = path.resolve(
  process.argv[2] || process.env.REGISTRY_PATH || path.join(ROOT, "registry")
);

async function doh(name, type) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `${DOH}?name=${encodeURIComponent(name)}&type=${type}`,
      { headers: { accept: "application/dns-json" }, signal: controller.signal }
    );
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** First answer data for the first record type that resolves. */
async function probe(name) {
  for (const type of ["A", "AAAA", "TXT"]) {
    try {
      const json = await doh(name, type);
      if (json.Answer && json.Answer.length) return json.Answer[0].data;
    } catch {
      // Try the next type.
    }
  }
  return null;
}

/** Does the zone exist at all? SOA answering means it is authoritative. */
async function zoneIsLive(zone) {
  try {
    const json = await doh(zone, "SOA");
    return Boolean(json.Answer && json.Answer.length);
  } catch {
    return false;
  }
}

async function main() {
  const domainsDir = path.join(REGISTRY_PATH, "domains");

  // Zone -> every name to probe. Names come straight from the entry data, so
  // adding a zone in the registry extends the probe with no change here.
  const namesByZone = new Map();
  if (fs.existsSync(domainsDir)) {
    for (const file of fs.readdirSync(domainsDir)) {
      if (!file.endsWith(".json") || file.startsWith("_") || file === "SCHEMA.json") continue;
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(domainsDir, file), "utf8"));
        (Array.isArray(parsed) ? parsed : [parsed]).forEach((entry) => {
          const zone = String(entry.domain || "").toLowerCase().trim();
          const sub = entry.subdomain;
          if (!zone || typeof sub !== "string" || !sub) return;
          if (!namesByZone.has(zone)) namesByZone.set(zone, new Set());
          namesByZone.get(zone).add(sub === "@" ? zone : `${sub}.${zone}`);
        });
      } catch {
        // Malformed JSON is the validator's problem, not the prober's.
      }
    }
  }

  if (namesByZone.size === 0) {
    console.error("health: no zones found in the registry; nothing to probe");
    process.exit(1);
  }

  let ok = 0;
  const failures = [];
  const deadZones = [];
  const resolved = new Set();

  for (const [zone, names] of Array.from(namesByZone).sort()) {
    console.log(`\n== ${zone} ==`);

    // Two different failures, two different signals:
    //   zone dead (no SOA)        -> red badge, real outage
    //   zone live but apex silent -> reported below as NO-ANSWER
    if (!(await zoneIsLive(zone))) {
      deadZones.push(zone);
      console.log(`NO-SOA    ${zone.padEnd(40)} zone is down`);
      continue;
    }

    for (const name of Array.from(names).sort()) {
      const answer = await probe(name);
      if (answer) {
        ok++;
        resolved.add(name);
        console.log(`OK        ${name.padEnd(40)} ${answer}`);
      } else {
        failures.push(name);
        console.log(`NO-ANSWER ${name.padEnd(40)} -`);
      }
    }
  }

  const total = Array.from(namesByZone.values()).reduce((n, s) => n + s.size, 0);
  console.log(`\n${ok}/${total} name(s) resolving across ${namesByZone.size} zone(s).`);
  if (failures.length > 0) {
    console.log(`No answer: ${failures.join(", ")}`);
  }

  // A dead zone is an outage and fails the run (red badge). Individual
  // no-answer names are reported but do not fail: a broken subdomain is a
  // bug, not a zone outage.
  if (deadZones.length > 0) {
    console.error(
      `health: ${deadZones.length} zone(s) not answering SOA: ${deadZones.join(", ")}`
    );
    process.exit(1);
  }

  // The website itself lives on site.domain (the Pages custom domain), which
  // is usually a zone apex. If that name stops resolving, the site is down:
  // same red badge as a dead zone.
  const configPath = path.join(ROOT, "site", "config.json");
  let siteHost = null;
  if (fs.existsSync(configPath)) {
    try {
      siteHost = JSON.parse(fs.readFileSync(configPath, "utf8")).site?.domain || null;
    } catch {
      // A broken config is the build's problem, not the prober's.
    }
  }
  if (siteHost && !resolved.has(siteHost) && !(await probe(siteHost))) {
    console.error(`health: the site host ${siteHost} has no A/AAAA/TXT answer. The site is down.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`health: ${err.message}`);
  process.exit(1);
});
