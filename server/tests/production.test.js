import { describe, it, expect, beforeAll, afterEach } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { loadClientApp, inlineScriptHashes } from "../src/config/clientApp.js";
import { checkStartupConfig, trustProxySetting } from "../src/config/startupChecks.js";
import { SESSION_COOKIE } from "../src/utils/session.js";

// A small fake build: index.html with one inline script (like the theme
// script) and one hashed asset.
const THEME_SCRIPT = `try { document.documentElement.dataset.x = "1"; } catch (e) {}`;
const INDEX_HTML = `<!doctype html><html><head><script>${THEME_SCRIPT}</script>
<script type="module" crossorigin src="/assets/index-AbC123.js"></script></head><body><div id="root"></div></body></html>`;
let clientApp;

beforeAll(() => {
  const dist = mkdtempSync(path.join(os.tmpdir(), "voiceloop-dist-test-"));
  mkdirSync(path.join(dist, "assets"));
  writeFileSync(path.join(dist, "index.html"), INDEX_HTML);
  writeFileSync(path.join(dist, "assets", "index-AbC123.js"), "console.log('app');");
  writeFileSync(path.join(dist, "favicon.svg"), "<svg/>");
  clientApp = loadClientApp(dist);
});

describe("GET /api/health", () => {
  it("answers only { ok: true }", async () => {
    const res = await request(createApp()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe("serving the built client (production)", () => {
  const app = () => createApp({ clientApp });

  it("serves index.html for the site's pages, never cached", async () => {
    for (const page of ["/", "/login", "/f/some-business", "/f/some-business/abc123", "/app/dashboard", "/super-admin"]) {
      const res = await request(app()).get(page);
      expect(res.status, page).toBe(200);
      expect(res.headers["content-type"], page).toMatch(/text\/html/);
      expect(res.headers["cache-control"], page).toBe("no-cache");
      expect(res.text, page).toContain('<div id="root">');
    }
  });

  it("caches hashed assets for a year, other files not at all", async () => {
    const asset = await request(app()).get("/assets/index-AbC123.js");
    expect(asset.status).toBe(200);
    expect(asset.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    const other = await request(app()).get("/favicon.svg");
    expect(other.headers["cache-control"]).toBe("no-cache");
  });

  it("keeps API 404s and missing assets as real 404s, not the page", async () => {
    for (const url of ["/api/nope", "/api", "/assets/missing.js"]) {
      const res = await request(app()).get(url);
      expect(res.status, url).toBe(404);
      expect(res.headers["content-type"], url).toMatch(/json/);
    }
    expect((await request(app()).post("/f/some-business")).status).toBe(404);
  });

  it("still answers the API", async () => {
    const res = await request(app()).get("/api/health");
    expect(res.body).toEqual({ ok: true });
  });

  it("allows exactly the inline theme script and blob: audio in the CSP", async () => {
    const hash = `'sha256-${crypto.createHash("sha256").update(THEME_SCRIPT).digest("base64")}'`;
    expect(inlineScriptHashes(INDEX_HTML)).toEqual([hash]);
    const csp = (await request(app()).get("/")).headers["content-security-policy"];
    expect(csp).toContain(`script-src 'self' ${hash}`);
    expect(csp).toContain("media-src 'self' blob:");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("hashes scripts the way browsers do, with Windows line endings turned into LF", () => {
    const lf = "\n  try { x(); } catch (e) {}\n";
    const crlf = lf.replace(/\n/g, "\r\n");
    const expected = `'sha256-${crypto.createHash("sha256").update(lf).digest("base64")}'`;
    expect(inlineScriptHashes(`<script>${crlf}</script>`)).toEqual([expected]);
    expect(inlineScriptHashes(`<script>${lf}</script>`)).toEqual([expected]);
  });

  it("is off without a build: the server stays API-only, as in development", async () => {
    expect(loadClientApp(path.join(os.tmpdir(), "voiceloop-no-such-dist"))).toBeNull();
    expect((await request(createApp()).get("/")).status).toBe(404);
  });
});

describe("TRUST_PROXY", () => {
  it("is off by default and reads hop counts, true and other values", () => {
    expect(trustProxySetting(undefined)).toBe(false);
    expect(trustProxySetting("")).toBe(false);
    expect(trustProxySetting("false")).toBe(false);
    expect(trustProxySetting("0")).toBe(false);
    expect(trustProxySetting("1")).toBe(1);
    expect(trustProxySetting("true")).toBe(true);
    expect(trustProxySetting("loopback")).toBe("loopback");
  });

  it("is applied to the app (off unless set)", () => {
    expect(createApp().get("trust proxy")).toBe(false);
    expect(createApp({ trustProxy: 1 }).get("trust proxy")).toBe(1);
  });
});

describe("startup checks", () => {
  const production = {
    NODE_ENV: "production",
    MONGODB_URI: "mongodb+srv://example",
    CLIENT_URL: "https://voiceloop.example",
    EMAIL_PROVIDER: "resend",
    TRUST_PROXY: "1",
  };

  it("pass with everything set", () => {
    expect(checkStartupConfig(production)).toEqual({ errors: [], warnings: [] });
  });

  it("stop production without MONGODB_URI or CLIENT_URL", () => {
    const { errors } = checkStartupConfig({ ...production, MONGODB_URI: "", CLIENT_URL: "" });
    expect(errors).toHaveLength(2);
    expect(errors.join(" ")).toMatch(/MONGODB_URI/);
    expect(errors.join(" ")).toMatch(/CLIENT_URL/);
  });

  it("allow console email in production, with a warning", () => {
    const { errors, warnings } = checkStartupConfig({ ...production, EMAIL_PROVIDER: "console" });
    expect(errors).toEqual([]);
    expect(warnings.join(" ")).toMatch(/password reset emails are NOT sent/);
  });

  it("warn when TRUST_PROXY is not set in production", () => {
    const { warnings } = checkStartupConfig({ ...production, TRUST_PROXY: "" });
    expect(warnings.join(" ")).toMatch(/TRUST_PROXY/);
  });

  it("don't apply in development", () => {
    expect(checkStartupConfig({ NODE_ENV: "development" })).toEqual({ errors: [], warnings: [] });
  });
});

describe("session cookie in production", () => {
  const previous = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = previous;
  });

  it("is Secure, HttpOnly and SameSite=Lax", async () => {
    process.env.NODE_ENV = "production";
    const res = await request(createApp({ limits: { register: 1000 } }))
      .post("/api/auth/register")
      .send({ name: "Prod Owner", email: "prod@owner.test", password: "correct-horse-battery", organizationName: "Prod Org" });
    expect(res.status).toBe(201);
    const cookie = res.headers["set-cookie"].find((c) => c.startsWith(`${SESSION_COOKIE}=`));
    expect(cookie).toMatch(/; Secure/);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Lax/);
  });
});
