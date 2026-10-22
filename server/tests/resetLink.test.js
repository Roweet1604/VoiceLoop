import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Organization } from "../src/models/Organization.js";
import { PasswordResetToken } from "../src/models/PasswordResetToken.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { hashToken, RESET_TOKEN_TTL_MS } from "../src/services/passwordReset.js";
import { RESET_LINKS_PER_ADMIN_PER_HOUR } from "../src/routes/superAdmin.js";
import { getEmailSender } from "../src/services/email/index.js";
import { SESSION_COOKIE, signSession } from "../src/utils/session.js";
import { escapeRegex } from "../src/utils/regex.js";

const app = createApp({ limits: { api: 10000, login: 1000, register: 1000, reset: 1000 } });
const PASSWORD = "correct-horse-battery";
const NEW_PASSWORD = "a-brand-new-passphrase";
const CLIENT_URL = (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/+$/, "");
const LINK = new RegExp(`^${escapeRegex(CLIENT_URL)}/reset-password\\?token=([A-Za-z0-9_-]{43})$`);
const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"];

let admin;
let adminCookie;
let emailSend;
let logged; // every console call made during the test, as text

beforeEach(async () => {
  admin = await User.create({
    name: "Ops Admin",
    email: "ops@voiceloop.test",
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    role: "superadmin",
  });
  adminCookie = `${SESSION_COOKIE}=${signSession(admin._id)}`;
  emailSend = vi.spyOn(getEmailSender(), "send").mockResolvedValue({ id: null });
  logged = [];
  for (const method of CONSOLE_METHODS) {
    vi.spyOn(console, method).mockImplementation((...args) => {
      logged.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function owner(label = "a") {
  const email = `owner@${label}.test`;
  const reg = await request(app)
    .post("/api/auth/register")
    .send({ name: `Owner ${label}`, email, password: PASSWORD, organizationName: `Org ${label}` });
  expect(reg.status).toBe(201);
  await Organization.updateOne({ _id: reg.body.organization.id }, { accessStatus: "active" });
  const cookie = reg.headers["set-cookie"].find((c) => c.startsWith(`${SESSION_COOKIE}=`)).split(";")[0];
  return { email, orgId: reg.body.organization.id, userId: reg.body.user.id, cookie };
}

const createLink = (orgId, cookie = adminCookie) =>
  request(app).post(`/api/super-admin/accounts/${orgId}/reset-link`).set("Cookie", cookie).send();
const reset = (token, newPassword = NEW_PASSWORD) =>
  request(app).post("/api/auth/reset-password").send({ token, newPassword });
const login = (email, password) => request(app).post("/api/auth/login").send({ email, password });

// Creates a link and returns its token.
async function tokenFor(orgId) {
  const res = await createLink(orgId);
  expect(res.status).toBe(201);
  return res.body.link.match(LINK)[1];
}

describe("POST /api/super-admin/accounts/:id/reset-link: protection", () => {
  it("refuses logged-out callers and owners, even for their own account", async () => {
    const a = await owner("a");
    const b = await owner("b");

    expect((await request(app).post(`/api/super-admin/accounts/${a.orgId}/reset-link`)).status).toBe(401);
    for (const orgId of [a.orgId, b.orgId]) {
      const res = await createLink(orgId, a.cookie);
      expect(res.status).toBe(403);
      expect(res.body).not.toHaveProperty("link");
    }
    expect(await PasswordResetToken.countDocuments()).toBe(0);
    expect(await AuditLog.exists({ action: "reset_link_created" })).toBeNull();
  });

  it("can't target a Super Admin", async () => {
    // The Super Admin's own id isn't an account.
    expect((await createLink(admin._id)).status).toBe(404);

    // Nor can an organization that (inconsistently) contains one.
    const a = await owner("a");
    await User.create({
      name: "Other Admin",
      email: "other-admin@voiceloop.test",
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role: "superadmin",
      organizationId: a.orgId,
    });
    const res = await createLink(a.orgId);
    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty("link");
    expect(await PasswordResetToken.countDocuments()).toBe(0);
  });

  it("returns 404 for unknown and malformed accounts and accounts without an owner", async () => {
    expect((await createLink(new mongoose.Types.ObjectId())).status).toBe(404);
    expect((await createLink("not-an-id")).status).toBe(404);
    const empty = await Organization.create({ name: "No owner", accessStatus: "active" });
    expect((await createLink(empty._id)).status).toBe(404);
    expect(await AuditLog.exists({ action: "reset_link_created" })).toBeNull();
  });

  it(`allows ${RESET_LINKS_PER_ADMIN_PER_HOUR} links per admin per hour`, async () => {
    const a = await owner("a");
    for (let i = 0; i < RESET_LINKS_PER_ADMIN_PER_HOUR; i++) expect((await createLink(a.orgId)).status).toBe(201);
    const limited = await createLink(a.orgId);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");

    // Counted per admin, not per IP: another admin isn't affected.
    const other = await User.create({
      name: "Second Admin",
      email: "second@voiceloop.test",
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role: "superadmin",
    });
    expect((await createLink(a.orgId, `${SESSION_COOKIE}=${signSession(other._id)}`)).status).toBe(201);
  });
});

describe("POST /api/super-admin/accounts/:id/reset-link", () => {
  it("returns a link to /reset-password that expires in 30 minutes, and stores only its hash", async () => {
    const a = await owner("a");
    const before = Date.now();
    const res = await createLink(a.orgId);
    expect(res.status).toBe(201);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(Object.keys(res.body).sort()).toEqual(["expiresAt", "link"]);
    const [, token] = res.body.link.match(LINK);

    const stored = await PasswordResetToken.find().lean();
    expect(stored).toHaveLength(1);
    expect(String(stored[0].userId)).toBe(a.userId);
    expect(stored[0].tokenHash).toBe(hashToken(token));
    expect(stored[0].tokenHash).not.toContain(token);
    expect(stored[0].usedAt).toBeNull();
    const expiresAt = new Date(res.body.expiresAt).getTime();
    expect(stored[0].expiresAt.getTime()).toBe(expiresAt);
    expect(expiresAt - before).toBeGreaterThanOrEqual(RESET_TOKEN_TTL_MS - 1000);
    expect(expiresAt - before).toBeLessThanOrEqual(RESET_TOKEN_TTL_MS + 5000);
  });

  it("works once with the reset page's API, and ends the owner's existing sessions", async () => {
    const a = await owner("a");
    const otherDevice = (await login(a.email, PASSWORD)).headers["set-cookie"][0].split(";")[0];
    const token = await tokenFor(a.orgId);

    expect((await reset(token)).status).toBe(200);
    for (const cookie of [a.cookie, otherDevice]) {
      const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
      expect(me.status).toBe(401);
      expect(me.body.error.code).toBe("SESSION_EXPIRED");
    }
    expect((await login(a.email, PASSWORD)).status).toBe(401);
    expect((await login(a.email, NEW_PASSWORD)).status).toBe(200);

    const again = await reset(token, "yet-another-passphrase");
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe("INVALID_RESET_TOKEN");
  });

  it("stops working after it expires", async () => {
    const a = await owner("a");
    const token = await tokenFor(a.orgId);
    await PasswordResetToken.updateOne({ tokenHash: hashToken(token) }, { expiresAt: new Date(Date.now() - 1000) });

    expect((await reset(token)).body.error.code).toBe("INVALID_RESET_TOKEN");
    expect((await login(a.email, PASSWORD)).status).toBe(200);
  });

  it("retires earlier unused links for that owner only", async () => {
    const a = await owner("a");
    const b = await owner("b");
    const first = await tokenFor(a.orgId);
    const bToken = await tokenFor(b.orgId);
    const second = await tokenFor(a.orgId);

    expect((await reset(first)).body.error.code).toBe("INVALID_RESET_TOKEN");
    expect((await reset(second)).status).toBe(200);
    expect((await reset(bToken)).status).toBe(200);
  });

  it("sends no email, logs no token or link, and stores the token nowhere", async () => {
    const a = await owner("a");
    const res = await createLink(a.orgId);
    const [, token] = res.body.link.match(LINK);
    expect((await reset(token)).status).toBe(200);

    expect(emailSend).not.toHaveBeenCalled();
    expect(logged.filter((line) => line.includes(token))).toEqual([]);

    // No document in any collection holds the token or the link.
    for (const collection of await mongoose.connection.db.collections()) {
      const text = JSON.stringify(await collection.find().toArray());
      expect(text, collection.collectionName).not.toContain(token);
    }
    // Nor does any Super Admin screen afterwards.
    for (const path of [
      "/api/super-admin/accounts?status=all",
      `/api/super-admin/accounts/${a.orgId}/history`,
      "/api/super-admin/audit-logs",
      "/api/super-admin/overview",
    ]) {
      const page = await request(app).get(path).set("Cookie", adminCookie);
      expect(page.status, path).toBe(200);
      expect(page.text, path).not.toContain(token);
      expect(page.text, path).not.toContain("reset-password?token");
    }
  });

  it("writes one audit entry on the organization with the actor, and no token or email", async () => {
    const a = await owner("a");
    const res = await createLink(a.orgId);
    const [, token] = res.body.link.match(LINK);

    const entries = await AuditLog.find({ action: "reset_link_created" }).lean();
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry).toMatchObject({ targetType: "Organization", context: { organizationName: "Org a" } });
    expect(String(entry.targetId)).toBe(a.orgId);
    expect(String(entry.actor)).toBe(String(admin._id));
    expect(entry.actorEmail).toBeUndefined();
    const text = JSON.stringify(entry);
    expect(text).not.toContain(token);
    expect(text).not.toContain(hashToken(token));
    expect(text).not.toMatch(/@|token|reset-password/i);

    const listed = await request(app).get("/api/super-admin/audit-logs").set("Cookie", adminCookie);
    expect(listed.body.entries.find((e) => e.action === "reset_link_created")).toMatchObject({
      actor: { name: "Ops Admin" },
      target: { type: "Organization", name: "Org a" },
    });
  });

  it("is removed with the account: tokens and audit entries", async () => {
    const a = await owner("a");
    const b = await owner("b");
    await tokenFor(a.orgId);
    await tokenFor(b.orgId);

    const res = await request(app)
      .post(`/api/super-admin/accounts/${a.orgId}/delete`)
      .set("Cookie", adminCookie)
      .send({ confirmName: "Org a" });
    expect(res.status).toBe(200);

    expect(await PasswordResetToken.exists({ userId: a.userId })).toBeNull();
    expect((await AuditLog.find({ targetId: a.orgId }).lean()).map((e) => e.action)).toEqual(["account_deleted"]);
    // B keeps its link and its entry.
    expect(await PasswordResetToken.exists({ userId: b.userId })).not.toBeNull();
    expect(await AuditLog.exists({ action: "reset_link_created", targetId: b.orgId })).not.toBeNull();
  });
});
