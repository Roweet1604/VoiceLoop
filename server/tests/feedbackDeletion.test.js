import { describe, it, expect, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import request from "supertest";
import bcrypt from "bcrypt";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Organization } from "../src/models/Organization.js";
import { Feedback } from "../src/models/Feedback.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { getStorage, StorageNotFoundError } from "../src/services/storage/index.js";
import { SESSION_COOKIE, signSession } from "../src/utils/session.js";

const app = createApp({
  limits: { api: 10000, login: 1000, register: 1000, public: 10000, submit: 10000, voice: 10000, export: 1000 },
});
const PASSWORD = "correct-horse-battery";

afterEach(() => {
  vi.restoreAllMocks();
});

// A minimal WebM header: enough to pass the upload's magic-byte check.
function webm(size = 3000) {
  const buffer = Buffer.alloc(size, 0x11);
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84]).copy(buffer);
  buffer.write("webm", 8, "latin1");
  return buffer;
}

async function fileExists(key) {
  try {
    const { stream } = await getStorage().getStream(key);
    stream.destroy();
    return true;
  } catch (err) {
    if (err instanceof StorageNotFoundError) return false;
    throw err;
  }
}

// An approved owner with a business. Feedback goes through the public API,
// as a customer would send it.
async function owner(label) {
  const reg = await request(app)
    .post("/api/auth/register")
    .send({ name: `Owner ${label}`, email: `${label}@${label}.test`, password: PASSWORD, organizationName: `Org ${label}` });
  const orgId = reg.body.organization.id;
  await Organization.updateOne({ _id: orgId }, { accessStatus: "active" });
  const cookie = reg.headers["set-cookie"].find((c) => c.startsWith(`${SESSION_COOKIE}=`)).split(";")[0];
  const business = (await request(app).post("/api/business").set("Cookie", cookie).send({ name: `Shop ${label}` })).body
    .business;
  const slug = business.publicSlug;
  const as = (method, path) => request(app)[method](path).set("Cookie", cookie);

  return {
    label,
    orgId,
    cookie,
    business,
    remove: (id) => as("delete", `/api/feedback/${id}`),
    get: (path) => as("get", path),
    async text(body) {
      const res = await request(app)
        .post(`/api/public/f/${slug}/submit`)
        .send({ category: "complaint", ...body, idempotencyKey: crypto.randomUUID() });
      expect(res.status).toBe(201);
      return Feedback.findOne({ businessId: business.id }).sort({ _id: -1 });
    },
    async voice() {
      const res = await request(app)
        .post(`/api/public/f/${slug}/submit-voice`)
        .field("category", "suggestion")
        .field("durationSec", "5")
        .field("idempotencyKey", crypto.randomUUID())
        .attach("audio", webm(), { filename: "r", contentType: "audio/webm" });
      expect(res.status).toBe(201);
      return Feedback.findOne({ businessId: business.id, submissionType: "voice" }).sort({ _id: -1 });
    },
  };
}

describe("DELETE /api/feedback/:id: access", () => {
  it("returns 404 to another tenant and leaves the item untouched", async () => {
    const a = await owner("a");
    const b = await owner("b");
    const item = await b.voice();
    const before = await Feedback.findById(item._id).lean();

    const res = await a.remove(item._id);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain(b.business.id);

    expect(await Feedback.findById(item._id).lean()).toEqual(before);
    expect(await fileExists(item.audioKey)).toBe(true);
    expect(await AuditLog.exists({ action: "feedback.deleted" })).toBeNull();
    expect((await b.get(`/api/feedback/${item._id}`)).status).toBe(200);
  });

  it("returns 404 for unknown and malformed ids", async () => {
    const a = await owner("a");
    expect((await a.remove(new Feedback()._id)).status).toBe(404);
    expect((await a.remove("not-an-id")).status).toBe(404);
  });

  it("refuses logged-out, pending, suspended and Super Admin callers", async () => {
    const a = await owner("a");
    const item = await a.text({ message: "Still here" });

    expect((await request(app).delete(`/api/feedback/${item._id}`)).status).toBe(401);

    const pending = await request(app)
      .post("/api/auth/register")
      .send({ name: "P", email: "p@p.test", password: PASSWORD, organizationName: "P org" });
    const pendingRes = await request(app)
      .delete(`/api/feedback/${item._id}`)
      .set("Cookie", pending.headers["set-cookie"][0].split(";")[0]);
    expect(pendingRes.status).toBe(403);
    expect(pendingRes.body.error.code).toBe("ACCESS_PENDING");

    const admin = await User.create({
      name: "Ops",
      email: "ops@voiceloop.test",
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role: "superadmin",
    });
    const adminRes = await request(app)
      .delete(`/api/feedback/${item._id}`)
      .set("Cookie", `${SESSION_COOKIE}=${signSession(admin._id)}`);
    expect(adminRes.status).toBe(403);

    await Organization.updateOne({ _id: a.orgId }, { accessStatus: "suspended" });
    const suspended = await a.remove(item._id);
    expect(suspended.status).toBe(403);
    expect(suspended.body.error.code).toBe("ACCESS_SUSPENDED");

    expect(await Feedback.exists({ _id: item._id })).not.toBeNull();
    expect(await AuditLog.exists({ action: "feedback.deleted" })).toBeNull();
  });
});

describe("DELETE /api/feedback/:id", () => {
  it("removes a voice item and its audio file, and only that item", async () => {
    const a = await owner("a");
    const kept = await a.voice();
    const item = await a.voice();
    expect(await fileExists(item.audioKey)).toBe(true);

    const res = await a.remove(item._id);
    expect(res.status).toBe(204);
    expect(await Feedback.exists({ _id: item._id })).toBeNull();
    expect(await fileExists(item.audioKey)).toBe(false);
    expect(await fileExists(kept.audioKey)).toBe(true);
    expect(await Feedback.exists({ _id: kept._id })).not.toBeNull();

    expect((await a.get(`/api/feedback/${item._id}`)).status).toBe(404);
    expect((await a.get(`/api/feedback/${item._id}/audio`)).status).toBe(404);
    expect((await a.remove(item._id)).status).toBe(404);
  });

  it("disappears from the inbox, summary, analytics and CSV export", async () => {
    const a = await owner("a");
    await a.text({ message: "Kept message about the tea" });
    const item = await a.text({ message: "Deleted message about the soup", customerEmail: "guest@a.test" });

    const counts = async () => ({
      inbox: (await a.get("/api/feedback")).body.total,
      search: (await a.get("/api/feedback?q=soup")).body.total,
      summary: (await a.get("/api/feedback/summary")).body.total,
      analytics: (await a.get("/api/analytics")).body.total,
      csv: (await a.get("/api/feedback/export.csv")).text,
    });

    const before = await counts();
    expect(before).toMatchObject({ inbox: 2, search: 1, summary: 2, analytics: 2 });
    expect(before.csv).toContain("Deleted message about the soup");

    expect((await a.remove(item._id)).status).toBe(204);

    const after = await counts();
    expect(after).toMatchObject({ inbox: 1, search: 0, summary: 1, analytics: 1 });
    expect(after.csv).not.toContain("soup");
    expect(after.csv).not.toContain("guest@a.test");
    expect(after.csv).toContain("Kept message about the tea");
  });

  it("writes one audit entry on the organization with category and type only", async () => {
    const a = await owner("a");
    const item = await a.text({ message: "Secret soup complaint", customerName: "Jane Guest", customerEmail: "jane@guest.test" });
    expect((await a.remove(item._id)).status).toBe(204);

    const entries = await AuditLog.find({ action: "feedback.deleted" }).lean();
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry).toMatchObject({ targetType: "Organization", context: { category: "complaint", submissionType: "text" } });
    expect(String(entry.targetId)).toBe(a.orgId);
    expect(entry.actorEmail).toBeUndefined();
    expect(Object.keys(entry.context).sort()).toEqual(["category", "submissionType"]);

    const text = JSON.stringify(entry);
    expect(text).not.toMatch(/soup|Jane|guest|@/i);
    expect(text).not.toContain(String(item._id));
  });

  it("still deletes the item if removing the file fails, and logs the key", async () => {
    const a = await owner("a");
    const item = await a.voice();
    const storage = getStorage();
    vi.spyOn(storage, "delete").mockRejectedValue(new Error("disk unavailable"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await a.remove(item._id);
    expect(res.status).toBe(204);
    expect(await Feedback.exists({ _id: item._id })).toBeNull();
    expect(await AuditLog.exists({ action: "feedback.deleted" })).not.toBeNull();
    expect(errors.mock.calls.some(([message]) => String(message).includes(item.audioKey))).toBe(true);
  });

  it("keeps the item and its file if the audit entry cannot be written", async () => {
    const a = await owner("a");
    const item = await a.voice();
    vi.spyOn(AuditLog, "create").mockRejectedValueOnce(new Error("write failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await a.remove(item._id)).status).toBe(500);
    expect(await Feedback.exists({ _id: item._id })).not.toBeNull();
    expect(await fileExists(item.audioKey)).toBe(true);
  });

  it("leaves no feedback.deleted entry behind when the account is deleted", async () => {
    const a = await owner("a");
    const item = await a.text({ message: "To be deleted" });
    expect((await a.remove(item._id)).status).toBe(204);

    const admin = await User.create({
      name: "Ops",
      email: "ops@voiceloop.test",
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role: "superadmin",
    });
    const res = await request(app)
      .post(`/api/super-admin/accounts/${a.orgId}/delete`)
      .set("Cookie", `${SESSION_COOKIE}=${signSession(admin._id)}`)
      .send({ confirmName: "Shop a" });
    expect(res.status).toBe(200);

    expect(await AuditLog.exists({ action: "feedback.deleted" })).toBeNull();
    expect((await AuditLog.find({ targetId: a.orgId }).lean()).map((e) => e.action)).toEqual(["account_deleted"]);
  });
});
