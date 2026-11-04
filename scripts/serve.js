#!/usr/bin/env node

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT, "dist");

const port =
  Number(process.argv[2]) ||
  Number(process.env.PORT) ||
  8080;

if (!fs.existsSync(path.join(DIST_DIR, "index.html"))) {
  console.error("serve: dist/index.html not found. Build first: npm run build");
  process.exit(1);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const candidates = [];
  if (clean === "/" || clean.endsWith("/")) {
    candidates.push(path.join(DIST_DIR, clean, "index.html"));
  } else {
    candidates.push(path.join(DIST_DIR, clean));
    candidates.push(path.join(DIST_DIR, `${clean}.html`));
  }
  for (const file of candidates) {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

const server = http.createServer((req, res) => {
  const file = resolveFile(req.url);
  if (!file) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found: " + req.url);
    return;
  }
  res.writeHead(200, {
    "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
    "Cache-Control": "no-cache, no-store, must-revalidate",
  });
  fs.createReadStream(file).pipe(res);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`serve: http://127.0.0.1:${port} (dist/, no cache). Ctrl+C to stop.`);
});
