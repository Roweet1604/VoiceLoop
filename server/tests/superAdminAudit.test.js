import { describe, it, expect, beforeEach } from "vitest";
import crypto from "node:crypto";
import request from "supertest";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Organization } from "../src/models/Organization.js";
import { Business } from "../src/models/Business.js";
import { Feedback } from "../src/models/Feedback.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { SESSION_COOKIE, signSession } from "../src/utils/session.js";

const app = createApp({ limits: { api: 10000, login: 1000, register: 1000, public: 10000, submit: 10000 } });
const PASSWORD = "correct-horse-battery";
const DAY = 24 * 60 * 60 * 1000;

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

const asAdmin = (path) => request(app).get(`/api/super-admin${path}`).set("Cookie", adminCookie);
const adminAction = (orgId, action, body) =>
  request(app).post(`/api/super-admin/accounts/${orgId}/${action}`).set("Cookie", adminCookie).send(body);

async function register(label) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: `Owner ${label}`, email: `${label}@${label}.test`, password: PASSWORD, organizationName: `Org ${label}` });
  expect(res.status).toBe(201);
  const cookie = res.headers["set-cookie"].find((c) => c.startsWith(`${SESSION_COOKIE}=`)).split(";")[0];
  return { label, orgId: res.body.organization.id, userId: res.body.user.id, cookie };
}

// Registered, approved, with a business.
async function activeOwner(label, { days = 30 } = {}) {
  const o = await register(label);
  expect((await adminAction(o.orgId, "approve", { days })).status).toBe(200);
  const created = await request(app).post("/api/business").set("Cookie", o.cookie).send({ name: `Shop ${label}` });
  expect(created.status).toBe(201);
  return { ...o, business: created.body.business };
}

const entry = (overrides = {}) => ({
  actor: admin._id,
  action: "access.approve",
  targetType: "Organization",
  targetId: new mongoose.Types.ObjectId(),
  context: {},
  createdAt: new Date(),
  ...overrides,
});

// Things that must never appear in a Super Admin response.
function expectNothingSensitive(res, extra = []) {
  const text = JSON.stringify(res.body);
  expect(text).not.toMatch(/passwordHash|\$2[aby]\$|actorEmail|@/);
  for (const secret of extra) expect(text).not.toContain(secret);
}

describe("access to the new routes", () => {
  it("refuses logged-out callers (401) and owners, active or pending (403)", async () => {
    const active = await activeOwner("a");
    const pending = await register("p");
    for (const path of ["/audit-logs", "/overview", `/accounts/${active.orgId}/history`]) {
      expect((await request(app).get(`/api/super-admin${path}`)).status, `anon ${path}`).toBe(401);
      for (const [who, cookie] of [
        ["active owner", active.cookie],
        ["pending owner", pending.cookie],
      ]) {
        const res = await request(app).get(`/api/super-admin${path}`).set("Cookie", cookie);
        expect(res.status, `${who} ${path}`).toBe(403);
        expect(res.body.error.code).toBe("FORBIDDEN");
      }
    }
  });
});

describe("GET /api/super-admin/audit-logs", () => {
  it("lists real actions newest first, with actor names and nothing sensitive", async () => {
    const a = await activeOwner("a");
    await request(app).patch("/api/business").set("Cookie", a.cookie).send({ welcomeMessage: "Secret welcome text" });
    await request(app)
      .post(`/api/public/f/${a.business.publicSlug}/submit`)
      .send({ category: "complaint", message: "Customer secret feedback", customerEmail: "guest@guest.test", idempotencyKey: crypto.randomUUID() });
    expect((await adminAction(a.orgId, "suspend", { reason: "Unpaid invoice" })).status).toBe(200);

    const res = await asAdmin("/audit-logs");
    expect(res.status).toBe(200);
    expect(res.body.entries.map((e) => e.action)).toEqual(["access.suspend", "business.updated", "business.created", "access.approve"]);
    const [suspend, updated] = res.body.entries;
    expect(suspend).toMatchObject({
      actor: { id: String(admin._id), name: "Ops Admin", role: "superadmin" },
      target: { type: "Organization", id: a.orgId, name: "Org a", exists: true },
      context: { fromStatus: "active", toStatus: "suspended", reason: "Unpaid invoice", organizationName: "Org a" },
    });
    expect(updated).toMatchObject({
      actor: { id: a.userId, name: "Owner a", role: "owner" },
      context: { businessName: "Shop a", fields: ["welcomeMessage"] },
    });
    expect(res.body.actions).toEqual(["access.approve", "access.suspend", "business.created", "business.updated"]);
    expectNothingSensitive(res, ["Secret welcome text", "Customer secret feedback"]);
  });

  it("returns only whitelisted context fields, whatever is stored", async () => {
    await AuditLog.create(
      entry({
        actorEmail: "ops@voiceloop.test",
        context: { reason: "ok", passwordHash: "$2b$10$abc", customerEmail: "x@y.test", message: "feedback text", token: "t" },
      })
    );
    const res = await asAdmin("/audit-logs");
    expect(res.body.entries[0].context).toEqual({ reason: "ok" });
    expectNothingSensitive(res, ["feedback text", '"token"']);
  });

  it("filters by action, target and date range", async () => {
    const target = new mongoose.Types.ObjectId();
    await AuditLog.create([
      entry({ action: "access.approve", targetId: target, createdAt: new Date("2026-05-01T10:00:00Z") }),
      entry({ action: "access.suspend", targetId: target, createdAt: new Date("2026-05-02T10:00:00Z") }),
      entry({ action: "access.suspend", createdAt: new Date("2026-05-03T10:00:00Z") }),
      entry({ action: "account_deleted", createdAt: new Date("2026-06-01T10:00:00Z") }),
    ]);
    const list = async (query) => (await asAdmin(`/audit-logs?${query}`)).body;

    expect((await list("action=access.suspend")).total).toBe(2);
    expect((await list(`targetId=${target}`)).entries.map((e) => e.action)).toEqual(["access.suspend", "access.approve"]);
    expect((await list(`targetId=${target}&action=access.approve`)).total).toBe(1);
    const may = await list("from=2026-05-02T00:00:00Z&to=2026-05-31T23:59:59Z");
    expect(may.entries.map((e) => e.createdAt)).toEqual(["2026-05-03T10:00:00.000Z", "2026-05-02T10:00:00.000Z"]);
    expect((await list("action=no.such.action")).entries).toEqual([]);
  });

  it("paginates newest first without overlap, at most 100 per page", async () => {
    await AuditLog.create(
      Array.from({ length: 7 }, (_, i) => entry({ createdAt: new Date(Date.UTC(2026, 4, 1, i)), context: { reason: `entry ${i}` } }))
    );
    const pages = [];
    for (const page of [1, 2, 3]) {
      const body = (await asAdmin(`/audit-logs?limit=3&page=${page}`)).body;
      expect(body).toMatchObject({ page, limit: 3, total: 7, totalPages: 3 });
      pages.push(...body.entries.map((e) => e.context.reason));
    }
    expect(pages).toEqual(["entry 6", "entry 5", "entry 4", "entry 3", "entry 2", "entry 1", "entry 0"]);
    expect((await asAdmin("/audit-logs?limit=100")).status).toBe(200);
  });

  it("searches action and safe context fields, treating regex characters literally", async () => {
    await AuditLog.create([
      entry({ action: "access.suspend", context: { reason: "Paid (cash) $5.00 [promo]" } }),
      entry({ action: "access.suspend", context: { reason: "Paid cash 5" } }),
      entry({ action: "account_deleted", context: { businessName: "Bean & Leaf" } }),
      entry({ action: "access.approve", context: { organizationName: "Corner Café" } }),
      // Not a searchable field: never matched, even though it's stored.
      entry({ action: "access.extend", context: { secretNote: "needle" } }),
    ]);
    const total = async (q) => (await asAdmin(`/audit-logs?q=${encodeURIComponent(q)}`)).body.total;

    expect(await total("(cash) $5.00 [")).toBe(1);
    expect(await total("paid")).toBe(2);
    expect(await total(".*")).toBe(0);
    expect(await total("^Paid")).toBe(0);
    expect(await total("bean & leaf")).toBe(1);
    expect(await total("corner")).toBe(1);
    expect(await total("account_del")).toBe(1);
    expect(await total("needle")).toBe(0);
  });

  it("rejects invalid queries", async () => {
    for (const query of [
      "limit=101",
      "limit=0",
      "page=0",
      "page=1.5",
      "targetId=not-an-id",
      "action=$ne",
      "action=access.approve&action=access.suspend",
      "from=yesterday",
      "from=2026-05-02T00:00:00Z&to=2026-05-01T00:00:00Z",
      `q=${"x".repeat(101)}`,
    ]) {
      const res = await asAdmin(`/audit-logs?${query}`);
      expect(res.status, query).toBe(400);
      expect(res.body.error.code).toBe("BAD_REQUEST");
    }
  });
});

describe("GET /api/super-admin/accounts/:id/history", () => {
  it("returns one account's status changes and audit entries, never another's", async () => {
    const a = await activeOwner("a");
    const b = await activeOwner("b");
    await adminAction(a.orgId, "suspend", { reason: "Chargeback on file" });
    await adminAction(b.orgId, "suspend", { reason: "B reason" });

    const res = await asAdmin(`/accounts/${a.orgId}/history`);
    expect(res.status).toBe(200);
    expect(res.body.account).toEqual({ id: a.orgId, name: "Org a" });
    expect(res.body.accessHistory.map((h) => [h.action, h.fromStatus, h.toStatus])).toEqual([
      ["suspend", "active", "suspended"],
      ["approve", "pending", "active"],
      ["requested", null, "pending"],
    ]);
    expect(res.body.accessHistory[0]).toMatchObject({ reason: "Chargeback on file", by: { name: "Ops Admin" } });
    expect(res.body.accessHistory[2].by).toMatchObject({ name: "Owner a", role: "owner" });
    expect(res.body.auditEntries.map((e) => e.action)).toEqual(["access.suspend", "business.created", "access.approve"]);
    expect(res.body.auditEntries.every((e) => e.target.id === a.orgId)).toBe(true);

    const text = JSON.stringify(res.body);
    expect(text).not.toContain(b.orgId);
    expect(text).not.toContain("B reason");
    expect(text).not.toContain("Shop b");
    expectNothingSensitive(res);
  });

  it("returns 404 for unknown, malformed and deleted accounts; the deletion entry stays in the audit log", async () => {
    const a = await activeOwner("a");
    expect((await asAdmin(`/accounts/${new mongoose.Types.ObjectId()}/history`)).status).toBe(404);
    expect((await asAdmin("/accounts/not-an-id/history")).status).toBe(404);

    const deleted = await request(app)
      .post(`/api/super-admin/accounts/${a.orgId}/delete`)
      .set("Cookie", adminCookie)
      .send({ confirmName: "Shop a" });
    expect(deleted.status).toBe(200);

    expect((await asAdmin(`/accounts/${a.orgId}/history`)).status).toBe(404);
    const log = (await asAdmin(`/audit-logs?targetId=${a.orgId}`)).body;
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]).toMatchObject({
      action: "account_deleted",
      target: { id: a.orgId, name: "Shop a", exists: false },
      context: { businessName: "Shop a" },
    });
  });
});

describe("GET /api/super-admin/overview", () => {
  it("counts accounts by effective status, businesses, feedback and stored audio", async () => {
    const active = await activeOwner("active", { days: 30 });
    const expiring = await activeOwner("soon", { days: 7 });
    await register("pending1");
    await register("pending2");
    const suspended = await register("suspended");
    await adminAction(suspended.orgId, "approve", { days: 30 });
    await adminAction(suspended.orgId, "suspend", { reason: "Testing" });
    const rejected = await register("rejected");
    await adminAction(rejected.orgId, "reject", {});
    const expired = await register("expired");
    await adminAction(expired.orgId, "approve", { days: 30 });
    await Organization.updateOne({ _id: expired.orgId }, { accessExpiresAt: new Date(Date.now() - DAY) });

    const feedback = (o, overrides) =>
      Feedback.create({
        businessId: o.business.id,
        organizationId: o.orgId,
        category: "general",
        message: "Hello",
        idempotencyKey: crypto.randomUUID(),
        ...overrides,
      });
    const voice = (bytes) => ({ submissionType: "voice", message: "", audioKey: "k", audioMimeType: "audio/webm", audioSizeBytes: bytes, transcriptStatus: "unavailable" });
    await feedback(active);
    await feedback(active);
    await feedback(expiring);
    await feedback(active, voice(1000));
    await feedback(expiring, voice(2500));

    const res = await asAdmin("/overview");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      accounts: { pending: 2, active: 2, suspended: 1, rejected: 1, expired: 1, expiringSoon: 1 },
      businesses: 2,
      feedback: 5,
      voiceRecordings: 2,
      audioBytes: 3500,
    });
    expect(await Business.countDocuments()).toBe(2);
    expectNothingSensitive(res);
  });

  it("returns zeros on an empty platform", async () => {
    const res = await asAdmin("/overview");
    expect(res.body).toEqual({
      accounts: { pending: 0, active: 0, suspended: 0, rejected: 0, expired: 0, expiringSoon: 0 },
      businesses: 0,
      feedback: 0,
      voiceRecordings: 0,
      audioBytes: 0,
    });
  });
});

describe("audit entries for owner business changes", () => {
  it("records creation and changed setting names (not values) against the organization", async () => {
    const a = await activeOwner("a");
    const patch = (body) => request(app).patch("/api/business").set("Cookie", a.cookie).send(body);

    // Same values as stored: nothing changed, nothing recorded.
    expect((await patch({ name: "Shop a", welcomeMessage: "" })).status).toBe(200);
    expect(await AuditLog.countDocuments({ action: "business.updated" })).toBe(0);

    expect((await patch({ name: "Shop A2", welcomeMessage: "Private welcome words", googleReviewUrl: "" })).status).toBe(200);

    const entries = await AuditLog.find({ action: /^business\./ }).sort({ createdAt: 1 }).lean();
    expect(entries.map((e) => e.action)).toEqual(["business.created", "business.updated"]);
    for (const e of entries) {
      expect(e).toMatchObject({ targetType: "Organization" });
      expect(String(e.targetId)).toBe(a.orgId);
      expect(String(e.actor)).toBe(a.userId);
      expect(e.actorEmail).toBeUndefined();
    }
    expect(entries[0].context).toEqual({ businessName: "Shop a" });
    expect(entries[1].context).toEqual({ businessName: "Shop A2", fields: ["name", "welcomeMessage"] });
    expect(JSON.stringify(entries)).not.toContain("Private welcome words");
  });

  it("are removed with the account, leaving only the deletion entry", async () => {
    const a = await activeOwner("a");
    await request(app).patch("/api/business").set("Cookie", a.cookie).send({ locationName: "Downtown" });
    expect(await AuditLog.countDocuments({ targetId: a.orgId })).toBe(3); // approve, created, updated

    await request(app).post(`/api/super-admin/accounts/${a.orgId}/delete`).set("Cookie", adminCookie).send({ confirmName: "Shop a" });
    const left = await AuditLog.find({ targetId: a.orgId }).lean();
    expect(left.map((e) => e.action)).toEqual(["account_deleted"]);
  });
});
