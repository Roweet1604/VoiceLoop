import { describe, it, expect } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import bcrypt from "bcrypt";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Organization } from "../src/models/Organization.js";
import { requireAuth, requireActiveAccess } from "../src/middleware/auth.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { SESSION_COOKIE, signSession } from "../src/utils/session.js";

// Generous limits so normal tests never hit them; the rate-limit test builds
// its own app with tight limits.
const app = createApp({ limits: { api: 10000, login: 1000, register: 1000 } });

// No feature routes use requireActiveAccess yet, so mount the real middleware
// on a minimal app to stand in for one.
const probe = express();
probe.use(cookieParser());
probe.get("/active-only", requireAuth, requireActiveAccess, (req, res) => res.json({ ok: true }));
probe.use(errorHandler);

const PASSWORD = "correct-horse-battery";
const DAY = 24 * 60 * 60 * 1000;

function newAccount(overrides = {}) {
  return {
    name: "Asha Rao",
    email: "asha@cornercafe.test",
    password: PASSWORD,
    organizationName: "Corner Cafe",
    ...overrides,
  };
}

// The "name=value" part of the session Set-Cookie header, ready to send back.
function sessionCookie(res) {
  const header = (res.headers["set-cookie"] || []).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return header?.split(";")[0];
}

async function register(overrides) {
  const res = await request(app).post("/api/auth/register").send(newAccount(overrides));
  expect(res.status).toBe(201);
  return { res, cookie: sessionCookie(res) };
}

async function setAccess(update) {
  await Organization.updateOne({}, update);
}

describe("POST /api/auth/register", () => {
  it("creates an owner with a pending organization and starts a session", async () => {
    const { res, cookie } = await register();

    expect(res.body.user).toMatchObject({ name: "Asha Rao", email: "asha@cornercafe.test", role: "owner" });
    expect(res.body.organization).toMatchObject({ name: "Corner Cafe", accessStatus: "pending" });
    expect(res.body.user).not.toHaveProperty("passwordHash");

    const setCookie = res.headers["set-cookie"].join(";");
    expect(cookie).toBeTruthy();
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);

    const user = await User.findOne({ email: "asha@cornercafe.test" }).select("+passwordHash");
    expect(user.passwordHash).not.toBe(PASSWORD);
    expect(await bcrypt.compare(PASSWORD, user.passwordHash)).toBe(true);

    const org = await Organization.findById(user.organizationId);
    expect(org.accessStatus).toBe("pending");
    expect(org.accessExpiresAt).toBeNull();
    expect(org.accessHistory).toHaveLength(1);
    expect(org.accessHistory[0]).toMatchObject({ action: "requested", toStatus: "pending" });
    expect(String(org.accessHistory[0].by)).toBe(String(user._id));
  });

  it("ignores a role, organization or access status sent in the body", async () => {
    const otherOrg = await Organization.create({ name: "Someone Else", accessStatus: "active" });

    const { res } = await register({
      role: "superadmin",
      organizationId: String(otherOrg._id),
      accessStatus: "active",
    });

    expect(res.body.user.role).toBe("owner");
    const user = await User.findOne({ email: "asha@cornercafe.test" });
    expect(user.role).toBe("owner");
    expect(String(user.organizationId)).not.toBe(String(otherOrg._id));
    expect((await Organization.findById(user.organizationId)).accessStatus).toBe("pending");
    expect(await User.countDocuments({ role: "superadmin" })).toBe(0);
  });

  it("rejects an invalid email and a password shorter than 10 characters", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send(newAccount({ email: "not-an-email", password: "short" }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
    expect(res.body.error.details).toHaveProperty("email");
    expect(res.body.error.details).toHaveProperty("password");
    expect(await User.countDocuments()).toBe(0);
    expect(await Organization.countDocuments()).toBe(0);
  });

  it("rejects non-string values such as query operators", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send(newAccount({ email: { $gt: "" } }));
    expect(res.status).toBe(400);
  });

  it("rejects a duplicate email regardless of case", async () => {
    await register();
    const res = await request(app)
      .post("/api/auth/register")
      .send(newAccount({ email: "ASHA@CornerCafe.test" }));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_IN_USE");
    expect(await Organization.countDocuments()).toBe(1);
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with the correct password, even while pending", async () => {
    await register();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "Asha@CornerCafe.test", password: PASSWORD });

    expect(res.status).toBe(200);
    expect(sessionCookie(res)).toBeTruthy();
    expect(res.body.organization.accessStatus).toBe("pending");
  });

  it("fails with a generic message for a wrong password", async () => {
    await register();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "asha@cornercafe.test", password: "wrong-password-123" });

    expect(res.status).toBe(401);
    expect(res.body.error).toEqual({ message: "Invalid email or password", code: "INVALID_CREDENTIALS" });
    expect(sessionCookie(res)).toBeUndefined();
  });

  it("gives the same response for an unknown email", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@nowhere.test", password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error).toEqual({ message: "Invalid email or password", code: "INVALID_CREDENTIALS" });
  });

  it("is rate limited more strictly than the rest of the API", async () => {
    const strictApp = createApp({ limits: { login: 2 } });
    const attempt = () =>
      request(strictApp).post("/api/auth/login").send({ email: "nobody@nowhere.test", password: "x" });

    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
  });
});

describe("GET /api/auth/me and POST /api/auth/logout", () => {
  it("returns the current user for a pending account", async () => {
    const { cookie } = await register();
    const res = await request(app).get("/api/auth/me").set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("asha@cornercafe.test");
    expect(res.body.organization.accessStatus).toBe("pending");
  });

  it("requires a valid session", async () => {
    expect((await request(app).get("/api/auth/me")).status).toBe(401);

    const forged = await request(app).get("/api/auth/me").set("Cookie", `${SESSION_COOKIE}=not.a.jwt`);
    expect(forged.status).toBe(401);
    expect(forged.body.error.code).toBe("UNAUTHORIZED");
  });

  it("clears the session cookie on logout", async () => {
    const { cookie } = await register();
    const res = await request(app).post("/api/auth/logout").set("Cookie", cookie);

    expect(res.status).toBe(204);
    expect(res.headers["set-cookie"].join(";")).toMatch(new RegExp(`${SESSION_COOKIE}=;.*Expires=Thu, 01 Jan 1970`, "i"));
  });
});

describe("requireActiveAccess", () => {
  let cookie;

  async function hitActiveOnly() {
    return request(probe).get("/active-only").set("Cookie", cookie);
  }

  it("rejects requests without a session", async () => {
    const res = await request(probe).get("/active-only");
    expect(res.status).toBe(401);
  });

  it("blocks a pending account", async () => {
    ({ cookie } = await register());
    const res = await hitActiveOnly();

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCESS_PENDING");
  });

  it("allows an active account with no expiry", async () => {
    ({ cookie } = await register());
    await setAccess({ accessStatus: "active", accessStartsAt: new Date(Date.now() - DAY), accessExpiresAt: null });

    const res = await hitActiveOnly();
    expect(res.status).toBe(200);
  });

  it("allows an active account before its expiry date", async () => {
    ({ cookie } = await register());
    await setAccess({ accessStatus: "active", accessExpiresAt: new Date(Date.now() + DAY) });

    expect((await hitActiveOnly()).status).toBe(200);
  });

  it("blocks an active account whose access period has ended, with no job having run", async () => {
    ({ cookie } = await register());
    await setAccess({
      accessStatus: "active",
      accessStartsAt: new Date(Date.now() - 30 * DAY),
      accessExpiresAt: new Date(Date.now() - 1000),
    });

    const res = await hitActiveOnly();
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCESS_EXPIRED");

    // The stored status is untouched; expiry is computed per request.
    expect((await Organization.findOne()).accessStatus).toBe("active");
    // /me still works and reports the effective status.
    const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(200);
    expect(me.body.organization.accessStatus).toBe("expired");
  });

  it.each([
    ["suspended", "ACCESS_SUSPENDED"],
    ["rejected", "ACCESS_REJECTED"],
    ["expired", "ACCESS_EXPIRED"],
  ])("blocks a %s account", async (status, code) => {
    ({ cookie } = await register());
    await setAccess({ accessStatus: status });

    const res = await hitActiveOnly();
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(code);
  });

  it("takes effect immediately when access changes after login", async () => {
    ({ cookie } = await register());
    await setAccess({ accessStatus: "active" });
    expect((await hitActiveOnly()).status).toBe(200);

    await setAccess({ accessStatus: "suspended" });
    const res = await hitActiveOnly();
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCESS_SUSPENDED");
  });

  it("lets the Super Admin through without an organization", async () => {
    const admin = await User.create({
      name: "Ops",
      email: "ops@voiceloop.test",
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role: "superadmin",
    });
    cookie = `${SESSION_COOKIE}=${signSession(admin._id)}`;

    expect((await hitActiveOnly()).status).toBe(200);
  });
});
