// Serving the built React app (client/dist) from this server, so the whole
// site runs as one service on one address in production. In development the
// Vite dev server serves the client instead and none of this is used.
import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

export const DEFAULT_CLIENT_DIST = fileURLToPath(new URL("../../../client/dist", import.meta.url));

// Hashed build files (/assets/index-AbC123.js) never change, so browsers can
// keep them for a year. Everything else, index.html above all, is checked
// with the server on every visit so a new deploy shows up straight away.
const LONG_CACHE = "public, max-age=31536000, immutable";
const NO_CACHE = "no-cache";

// Reads the build, or returns null when there isn't one (index.html missing).
export function loadClientApp(distDir = DEFAULT_CLIENT_DIST) {
  const root = path.resolve(distDir);
  const indexFile = path.join(root, "index.html");
  if (!existsSync(indexFile)) return null;
  return { root, indexFile, inlineScriptHashes: inlineScriptHashes(readFileSync(indexFile, "utf8")) };
}

// CSP hashes ('sha256-...') of index.html's inline scripts (the small one that
// applies the saved theme before React loads), so the CSP can allow exactly
// those scripts and no others. Browsers turn CRLF and CR line endings into LF
// before hashing a script, so the same is done here (a build made on Windows
// has CRLF).
export function inlineScriptHashes(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1].replace(/\r\n?/g, "\n"))
    .filter((body) => body.trim())
    .map((body) => `'sha256-${crypto.createHash("sha256").update(body, "utf8").digest("base64")}'`);
}

// Helmet's default CSP, adjusted for the client: its inline theme script,
// recordings played from blob: URLs, and no upgrade-insecure-requests (the
// host's HTTPS and HSTS already cover that, and it breaks plain-http local
// testing).
export function clientContentSecurityPolicy(helmet, clientApp) {
  return {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'", ...clientApp.inlineScriptHashes],
      "media-src": ["'self'", "blob:"],
      "upgrade-insecure-requests": null,
    },
  };
}

// Static files, then index.html for any other GET that isn't an API call, so
// React Router can handle /f/<slug>, /app/... and the rest.
export function clientAppRouter(clientApp) {
  const router = express.Router();

  router.use(
    express.static(clientApp.root, {
      index: false,
      setHeaders(res, filePath) {
        const inAssets = path.relative(clientApp.root, filePath).split(path.sep)[0] === "assets";
        res.set("Cache-Control", inAssets ? LONG_CACHE : NO_CACHE);
      },
    })
  );

  router.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    // Unknown API paths and missing build files stay real 404s.
    if (req.path === "/api" || req.path.startsWith("/api/") || req.path.startsWith("/assets/")) return next();
    res.set("Cache-Control", NO_CACHE);
    res.sendFile(clientApp.indexFile);
  });

  return router;
}
