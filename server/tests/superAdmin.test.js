import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Organization } from "../src/models/Organization.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { requireAuth, requireActiveAccess } from "../src/middleware/auth.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { SESSION_COOKIE, signSession } from "../src/utils/session.js";

const app = createApp({ limits: { api: 10000, login: 1000, register: 1000 } });

// Stand-in for a feature route protected by requireActiveAccess.
const probe = express();
probe.use(cookieParser());
probe.get("/active-only", requireAuth, requireActiveAccess, (req, res) => res.json({ ok: true }));
probe.use(errorHandler);

const DAY = 24 * 60 * 60 * 1000;
const PASSWORD = "correct-horse-battery";

let admin;
let adminCookie;

beforeEach(async () => {
  admin = await User.create({
    name: "Ops Admin",
    email: "ops@voiceloop.test",
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    role: "superadmin",
  });
  adminCookie = `${SESSION_COOKIE}=${signSession(admin._id)}`;
});

async function registerOwner({ email = "asha@cornercafe.test", name = "Asha Rao", business = "Corner Cafe" } = {}) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name, email, password: PASSWORD, organizationName: business });
  expect(res.status).toBe(201);
  const cookie = res.headers["set-cookie"].find((c) => c.startsWith(`${SESSION_COOKIE}=`)).split(";")[0];
  return { cookie, orgId: res.body.organization.id };
}

const asAdmin = {
  get: (path) => request(app).get(`/api/super-admin${path}`).set("Cookie", adminCookie),
  post: (path, body = {}) => request(app).post(`/api/super-admin${path}`).set("Cookie", adminCookie).send(body),
};

const act = (orgId, action, body) => asAdmin.post(`/accounts/${orgId}/${action}`, body);

function expectNoPasswordData(res) {
  const text = JSON.stringify(res.body);
  expect(text).not.toMatch(/password/i);
  expect(text).not.toMatch(/\$2[aby]\$/); // bcrypt hash prefix
}

function expectAbout(actual, expectedMs, toleranceMs = 60_000) {
  expect(Math.abs(new Date(actual).getTime() - expectedMs)).toBeLessThan(toleranceMs);
}

const ROUTES = [
  ["get", "/accounts"],
  ["post", "/accounts/:id/approve"],
  ["post", "/accounts/:id/reject"],
  ["post", "/accounts/:id/suspend"],
  ["post", "/accounts/:id/reactivate"],
  ["post", "/accounts/:id/extend"],
];

describe("Super Admin route protection", () => {
  it("returns 403 to an owner on every route, even an active one, and changes nothing", async () => {
    const { cookie, orgId } = await registerOwner();
    await Organization.updateOne({ _id: orgId }, { accessStatus: "active" });

    for (const [method, path] of ROUTES) {
      const res = await request(app)[method](`/api/super-admin${path.replace(":id", orgId)}`)
        .set("Cookie", cookie)
        .send({ days: 30, reason: "test" });
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    }
    expect(await AuditLog.countDocuments()).toBe(0);
    expect((await Organization.findById(orgId)).accessHistory).toHaveLength(1);
  });

  it("returns 401 without a session", async () => {
    for (const [method, path] of ROUTES) {
      const res = await request(app)[method](`/api/super-admin${path.replace(":id", new mongoose.Types.ObjectId())}`);
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });
});

describe("GET /api/super-admin/accounts", () => {
  it("lists accounts with owner details and no password data", async () => {
    await registerOwner();
    const res = await asAdmin.get("/accounts");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.accounts[0]).toMatchObject({
      name: "Corner Cafe",
      owner: { name: "Asha Rao", email: "asha@cornercafe.test" },
      accessStatus: "pending",
      accessStartsAt: null,
      accessExpiresAt: null,
      daysRemaining: null,
    });
    expect(res.body.accounts[0].requestedAt).toBeTruthy();
    expect(res.body.accounts[0]).not.toHaveProperty("accessHistory");
    expectNoPasswordData(res);
  });

  it("filters by status, searches by business, owner name or email, and paginates", async () => {
    const a = await registerOwner({ email: "asha@cornercafe.test", name: "Asha Rao", business: "Corner Cafe" });
    await registerOwner({ email: "ben@bluesalon.test", name: "Ben Ito", business: "Blue Salon" });
    await registerOwner({ email: "cy@harbor.test", name: "Cy Moss", business: "Harbor Hotel" });
    await act(a.orgId, "approve", { days: 30 });

    const pending = await asAdmin.get("/accounts?status=pending");
    expect(pending.body.accounts.map((x) => x.name).sort()).toEqual(["Blue Salon", "Harbor Hotel"]);
    expect(pending.body.counts).toMatchObject({ pending: 2, active: 1, all: 3 });

    expect((await asAdmin.get("/accounts?q=salon")).body.accounts.map((x) => x.name)).toEqual(["Blue Salon"]);
    expect((await asAdmin.get("/accounts?q=Cy%20Moss")).body.accounts.map((x) => x.name)).toEqual(["Harbor Hotel"]);
    expect((await asAdmin.get("/accounts?q=ASHA@")).body.accounts.map((x) => x.name)).toEqual(["Corner Cafe"]);
    // Regex characters are matched literally.
    expect((await asAdmin.get("/accounts?q=.*")).body.total).toBe(0);

    const page1 = await asAdmin.get("/accounts?limit=2&page=1");
    const page2 = await asAdmin.get("/accounts?limit=2&page=2");
    expect(page1.body).toMatchObject({ total: 3, totalPages: 2 });
    expect(page1.body.accounts).toHaveLength(2);
    expect(page2.body.accounts).toHaveLength(1);
  });

  it("filters accounts expiring within 7 days and reports lapsed ones as expired", async () => {
    const soon = await registerOwner({ email: "a@a.test", business: "Soon" });
    const later = await registerOwner({ email: "b@b.test", business: "Later" });
    const lapsed = await registerOwner({ email: "c@c.test", business: "Lapsed" });
    await Organization.updateOne({ _id: soon.orgId }, { accessStatus: "active", accessExpiresAt: new Date(Date.now() + 3 * DAY) });
    await Organization.updateOne({ _id: later.orgId }, { accessStatus: "active", accessExpiresAt: new Date(Date.now() + 30 * DAY) });
    await Organization.updateOne({ _id: lapsed.orgId }, { accessStatus: "active", accessExpiresAt: new Date(Date.now() - DAY) });

    const expiring = await asAdmin.get("/accounts?expiring=true");
    expect(expiring.body.accounts.map((x) => x.name)).toEqual(["Soon"]);
    expect(expiring.body.accounts[0].daysRemaining).toBe(3);
    expect(expiring.body.counts).toMatchObject({ expiringSoon: 1, active: 2, expired: 1 });

    const expired = await asAdmin.get("/accounts?status=expired");
    expect(expired.body.accounts.map((x) => x.name)).toEqual(["Lapsed"]);
    expect(expired.body.accounts[0].daysRemaining).toBeNull();
  });

  it("rejects invalid query parameters", async () => {
    const res = await asAdmin.get("/accounts?status=paid&page=0&expiring=yes");
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details).sort()).toEqual(["expiring", "page", "status"]);
  });
});

describe("approve", () => {
  it("sets active with the right dates, and the owner then passes requireActiveAccess", async () => {
    const { cookie, orgId } = await registerOwner();
    expect((await request(probe).get("/active-only").set("Cookie", cookie)).status).toBe(403);

    const res = await act(orgId, "approve", { days: 30 });
    expect(res.status).toBe(200);
    expect(res.body.account).toMatchObject({ accessStatus: "active", daysRemaining: 30 });
    expectAbout(res.body.account.accessStartsAt, Date.now());
    expectAbout(res.body.account.accessExpiresAt, Date.now() + 30 * DAY);
    expectNoPasswordData(res);

    const org = await Organization.findById(orgId);
    expect(org.accessStatus).toBe("active");
    expectAbout(org.accessExpiresAt, Date.now() + 30 * DAY);

    expect((await request(probe).get("/active-only").set("Cookie", cookie)).status).toBe(200);
  });

  it("accepts a custom end date or no expiry", async () => {
    const a = await registerOwner({ email: "a@a.test" });
    const b = await registerOwner({ email: "b@b.test" });
    const endDate = new Date(Date.now() + 45 * DAY).toISOString();

    const custom = await act(a.orgId, "approve", { endDate });
    expect(custom.status).toBe(200);
    expect(custom.body.account.accessExpiresAt).toBe(endDate);

    const open = await act(b.orgId, "approve", { noExpiry: true });
    expect(open.status).toBe(200);
    expect(open.body.account).toMatchObject({ accessStatus: "active", accessExpiresAt: null, daysRemaining: null });
  });

  it.each([
    [{}, "term"],
    [{ days: 15 }, "days"],
    [{ days: "30" }, "days"],
    [{ days: 30, noExpiry: true }, "term"],
    [{ endDate: new Date(Date.now() - DAY).toISOString() }, "endDate"],
    [{ endDate: "next tuesday" }, "endDate"],
  ])("rejects invalid body %j", async (body, field) => {
    const { orgId } = await registerOwner();
    const res = await act(orgId, "approve", body);
    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveProperty(field);
    expect((await Organization.findById(orgId)).accessStatus).toBe("pending");
  });

  it("refuses to approve an account that is already active", async () => {
    const { orgId } = await registerOwner();
    await act(orgId, "approve", { days: 30 });
    const res = await act(orgId, "approve", { days: 90 });

    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ message: "This account is already active", code: "INVALID_TRANSITION" });
    expect(await AuditLog.countDocuments()).toBe(1);
  });

  it("returns 404 for unknown or malformed ids", async () => {
    expect((await act(new mongoose.Types.ObjectId(), "approve", { days: 7 })).status).toBe(404);
    expect((await act("not-an-id", "approve", { days: 7 })).status).toBe(404);
  });
});

describe("reject, suspend and reactivate", () => {
  it("rejects a pending request, but not an active account", async () => {
    const a = await registerOwner({ email: "a@a.test" });
    const b = await registerOwner({ email: "b@b.test" });

    const res = await act(a.orgId, "reject", { reason: "Not a real business" });
    expect(res.status).toBe(200);
    expect(res.body.account.accessStatus).toBe("rejected");
    expect((await request(probe).get("/active-only").set("Cookie", a.cookie)).body.error.code).toBe("ACCESS_REJECTED");

    await act(b.orgId, "approve", { days: 7 });
    expect((await act(b.orgId, "reject")).status).toBe(409);
  });

  it("requires a reason to suspend", async () => {
    const { orgId } = await registerOwner();
    await act(orgId, "approve", { days: 30 });

    for (const body of [{}, { reason: "   " }, { reason: 42 }]) {
      const res = await act(orgId, "suspend", body);
      expect(res.status).toBe(400);
      expect(res.body.error.details).toHaveProperty("reason");
    }
    expect((await Organization.findById(orgId)).accessStatus).toBe("active");
  });

  it("blocks a suspended owner on their very next request, and reactivation restores access", async () => {
    const { cookie, orgId } = await registerOwner();
    await act(orgId, "approve", { days: 30 });
    expect((await request(probe).get("/active-only").set("Cookie", cookie)).status).toBe(200);

    const suspended = await act(orgId, "suspend", { reason: "Abuse report under review" });
    expect(suspended.status).toBe(200);
    expect(suspended.body.account.accessStatus).toBe("suspended");

    // Same cookie, no re-login.
    const blocked = await request(probe).get("/active-only").set("Cookie", cookie);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("ACCESS_SUSPENDED");

    expect((await act(orgId, "suspend", { reason: "again" })).status).toBe(409);

    const reactivated = await act(orgId, "reactivate");
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.account.accessStatus).toBe("active");
    expectAbout(reactivated.body.account.accessExpiresAt, Date.now() + 30 * DAY); // original end kept
    expect((await request(probe).get("/active-only").set("Cookie", cookie)).status).toBe(200);
  });

  it("requires a new term to reactivate when the end date passed during suspension", async () => {
    const { orgId } = await registerOwner();
    await act(orgId, "approve", { days: 7 });
    await act(orgId, "suspend", { reason: "Paused" });
    await Organization.updateOne({ _id: orgId }, { accessExpiresAt: new Date(Date.now() - DAY) });

    const without = await act(orgId, "reactivate");
    expect(without.status).toBe(400);
    expect(without.body.error.details).toHaveProperty("term");

    const withTerm = await act(orgId, "reactivate", { days: 30 });
    expect(withTerm.status).toBe(200);
    expect(withTerm.body.account.accessStatus).toBe("active");
    expectAbout(withTerm.body.account.accessExpiresAt, Date.now() + 30 * DAY);
  });

  it("only reactivates suspended accounts", async () => {
    const { orgId } = await registerOwner();
    const res = await act(orgId, "reactivate");
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_TRANSITION");
  });
});

describe("extend", () => {
  it("adds days to the current end date", async () => {
    const { orgId } = await registerOwner();
    const approved = await act(orgId, "approve", { days: 30 });
    const end = new Date(approved.body.account.accessExpiresAt).getTime();

    const res = await act(orgId, "extend", { days: 14 });
    expect(res.status).toBe(200);
    expect(new Date(res.body.account.accessExpiresAt).getTime()).toBe(end + 14 * DAY);
    expect(res.body.account.daysRemaining).toBe(44);
  });

  it("sets a new later end date, and refuses an earlier one", async () => {
    const { orgId } = await registerOwner();
    await act(orgId, "approve", { days: 30 });

    const earlier = await act(orgId, "extend", { endDate: new Date(Date.now() + 10 * DAY).toISOString() });
    expect(earlier.status).toBe(400);
    expect(earlier.body.error.details).toHaveProperty("endDate");

    const endDate = new Date(Date.now() + 60 * DAY).toISOString();
    const later = await act(orgId, "extend", { endDate });
    expect(later.status).toBe(200);
    expect(later.body.account.accessExpiresAt).toBe(endDate);
  });

  it("revives an expired account, counting days from today", async () => {
    const { cookie, orgId } = await registerOwner();
    await act(orgId, "approve", { days: 7 });
    await Organization.updateOne({ _id: orgId }, { accessExpiresAt: new Date(Date.now() - 2 * DAY) });
    expect((await request(probe).get("/active-only").set("Cookie", cookie)).body.error.code).toBe("ACCESS_EXPIRED");

    const res = await act(orgId, "extend", { days: 30 });
    expect(res.status).toBe(200);
    expect(res.body.account.accessStatus).toBe("active");
    expectAbout(res.body.account.accessExpiresAt, Date.now() + 30 * DAY);
    expect((await request(probe).get("/active-only").set("Cookie", cookie)).status).toBe(200);
  });

  it("refuses accounts that have no expiry, are pending, or have invalid input", async () => {
    const a = await registerOwner({ email: "a@a.test" });
    const b = await registerOwner({ email: "b@b.test" });
    await act(a.orgId, "approve", { noExpiry: true });

    expect((await act(a.orgId, "extend", { days: 30 })).status).toBe(409);
    expect((await act(b.orgId, "extend", { days: 30 })).status).toBe(409);
    expect((await act(b.orgId, "extend", { days: 0 })).status).toBe(400);
    expect((await act(b.orgId, "extend", { days: 2.5 })).status).toBe(400);
    expect((await act(b.orgId, "extend", {})).status).toBe(400);
  });
});

describe("history and audit log", () => {
  it("records every action in accessHistory and the AuditLog, with no password data", async () => {
    const { orgId } = await registerOwner();
    const responses = [
      await act(orgId, "approve", { days: 30 }),
      await act(orgId, "suspend", { reason: "Spam reports under review" }),
      await act(orgId, "reactivate"),
      await act(orgId, "extend", { days: 10 }),
    ];
    for (const res of responses) {
      expect(res.status).toBe(200);
      expectNoPasswordData(res);
    }
    const rejected = await registerOwner({ email: "z@z.test" });
    await act(rejected.orgId, "reject", { reason: "Duplicate request" });

    const org = await Organization.findById(orgId);
    expect(org.accessHistory.map((h) => [h.action, h.fromStatus, h.toStatus])).toEqual([
      ["requested", null, "pending"],
      ["approve", "pending", "active"],
      ["suspend", "active", "suspended"],
      ["reactivate", "suspended", "active"],
      ["extend", "active", "active"],
    ]);
    for (const entry of org.accessHistory.slice(1)) {
      expect(String(entry.by)).toBe(String(admin._id));
      expect(entry.at).toBeInstanceOf(Date);
    }
    expect(org.accessHistory[2].reason).toBe("Spam reports under review");

    const logs = await AuditLog.find().sort({ createdAt: 1 }).lean();
    expect(logs.map((l) => l.action)).toEqual([
      "access.approve",
      "access.suspend",
      "access.reactivate",
      "access.extend",
      "access.reject",
    ]);
    for (const log of logs) {
      expect(String(log.actor)).toBe(String(admin._id));
      expect(log.actorEmail).toBe("ops@voiceloop.test");
      expect(log.targetType).toBe("Organization");
      expect(log.createdAt).toBeInstanceOf(Date);
      expect(JSON.stringify(log)).not.toMatch(/password|\$2[aby]\$/i);
    }
    expect(logs[1].context).toMatchObject({ fromStatus: "active", toStatus: "suspended", reason: "Spam reports under review" });
    expect(String(logs[4].targetId)).toBe(String(rejected.orgId));
  });

  it("writes nothing when an action is refused", async () => {
    const { orgId } = await registerOwner();
    await act(orgId, "suspend", { reason: "x" }); // pending: invalid transition
    await act(orgId, "approve", { days: 3 }); // invalid days

    expect(await AuditLog.countDocuments()).toBe(0);
    expect((await Organization.findById(orgId)).accessHistory).toHaveLength(1);
  });
});
