import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import path from "node:path";
import { readdir } from "node:fs/promises";
import request from "supertest";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Organization } from "../src/models/Organization.js";
import { Business } from "../src/models/Business.js";
import { FeedbackLink } from "../src/models/FeedbackLink.js";
import { Feedback } from "../src/models/Feedback.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { ORGANIZATION_DATA, STORED_FILES } from "../src/services/accountDeletion.js";
import { getStorage } from "../src/services/storage/index.js";
import { SESSION_COOKIE, signSession } from "../src/utils/session.js";

const app = createApp({ limits: { api: 10000, login: 1000, register: 1000, public: 10000, submit: 10000, voice: 10000 } });
const PASSWORD = "correct-horse-battery";

// Each test builds one or two fully populated tenants (including uploads)
// against a remote database, which can take longer than the default timeout.
vi.setConfig({ testTimeout: 60000 });

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

afterEach(() => {
  vi.restoreAllMocks();
});

const asAdmin = (path, body) =>
  request(app).post(`/api/super-admin/accounts${path}`).set("Cookie", adminCookie).send(body);
const deleteAccount = (orgId, confirmName) => asAdmin(`/${orgId}/delete`, { confirmName });

// Stored files under one business's prefix (every key starts with its id).
async function storedFilesOf(businessId) {
  const dir = path.join(getStorage().root, String(businessId));
  try {
    return (await readdir(dir)).sort();
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

// A minimal WebM header: enough to pass the upload's magic-byte check.
function webm(size = 3000) {
  const buffer = Buffer.alloc(size, 0x11);
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84]).copy(buffer);
  buffer.write("webm", 8, "latin1");
  return buffer;
}

// A fully populated tenant: approved owner, business, an extra link, feedback
// through both links (one complaint with an internal note), two voice
// recordings in storage, and audit entries.
async function tenant(label) {
  const email = `owner@${label}.test`;
  const reg = await request(app)
    .post("/api/auth/register")
    .send({ name: `Owner ${label}`, email, password: PASSWORD, organizationName: `Org ${label}` });
  const orgId = reg.body.organization.id;
  const cookie = reg.headers["set-cookie"].find((c) => c.startsWith(`${SESSION_COOKIE}=`)).split(";")[0];

  expect((await asAdmin(`/${orgId}/approve`, { days: 30 })).status).toBe(200);
  const business = (await request(app).post("/api/business").set("Cookie", cookie).send({ name: `Shop ${label}` })).body
    .business;
  const link = (await request(app).post("/api/links").set("Cookie", cookie).send({ name: "Table 4" })).body.link;

  for (const body of [
    { category: "complaint", message: `Cold food at ${label}` },
    { category: "compliment", message: `Great staff at ${label}`, linkCode: link.code, customerEmail: `guest@${label}.test` },
  ]) {
    const res = await request(app)
      .post(`/api/public/f/${business.publicSlug}/submit`)
      .send({ ...body, idempotencyKey: crypto.randomUUID() });
    expect(res.status).toBe(201);
  }
  for (const linkCode of [undefined, link.code]) {
    const req = request(app)
      .post(`/api/public/f/${business.publicSlug}/submit-voice`)
      .field("category", "suggestion")
      .field("durationSec", "5")
      .field("idempotencyKey", crypto.randomUUID());
    if (linkCode) req.field("linkCode", linkCode);
    expect((await req.attach("audio", webm(), { filename: "r", contentType: "audio/webm" })).status).toBe(201);
  }
  expect(await storedFilesOf(business.id)).toHaveLength(2);
  // Notes, review and complaint history through the inbox API, so deletion is
  // checked against the data it really holds (all embedded in Feedback).
  const complaint = await Feedback.findOne({ businessId: business.id, category: "complaint" });
  const inbox = (method, path, body) => request(app)[method](`/api/feedback/${complaint._id}${path}`).set("Cookie", cookie).send(body);
  expect((await inbox("post", "/notes", { text: `Private note for ${label}` })).status).toBe(201);
  expect((await inbox("patch", "/review", { reviewStatus: "reviewed" })).status).toBe(200);
  expect((await inbox("patch", "/complaint-status", { status: "resolved", resolutionSummary: `Refunded ${label}` })).status).toBe(200);

  return { orgId, cookie, email, business, link, slug: business.publicSlug };
}

// Everything stored for an organization, for before/after comparisons.
async function snapshot(orgId) {
  const id = new mongoose.Types.ObjectId(orgId);
  return {
    organization: await Organization.findById(id).lean(),
    users: await User.find({ organizationId: id }).lean(),
    businesses: await Business.find({ organizationId: id }).lean(),
    links: await FeedbackLink.find({ organizationId: id }).lean(),
    feedback: await Feedback.find({ organizationId: id }).lean(),
    audit: await AuditLog.find({ targetId: id }).lean(),
    files: (await Promise.all((await Business.find({ organizationId: id })).map((b) => storedFilesOf(b._id)))).flat(),
  };
}

describe("POST /api/super-admin/accounts/:id/delete: protection", () => {
  it("refuses owners (even active ones targeting another tenant) and logged-out callers", async () => {
    const a = await tenant("a");
    const b = await tenant("b");
    const before = await snapshot(b.orgId);

    const asOwner = await request(app)
      .post(`/api/super-admin/accounts/${b.orgId}/delete`)
      .set("Cookie", a.cookie)
      .send({ confirmName: "Shop b" });
    expect(asOwner.status).toBe(403);
    expect(asOwner.body.error.code).toBe("FORBIDDEN");

    const ownOrg = await request(app)
      .post(`/api/super-admin/accounts/${a.orgId}/delete`)
      .set("Cookie", a.cookie)
      .send({ confirmName: "Shop a" });
    expect(ownOrg.status).toBe(403);

    const anonymous = await request(app).post(`/api/super-admin/accounts/${b.orgId}/delete`).send({ confirmName: "Shop b" });
    expect(anonymous.status).toBe(401);

    expect(await snapshot(b.orgId)).toEqual(before);
    expect(await Organization.exists({ _id: a.orgId })).toBeTruthy();
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["wrong name", "Shop z"],
    ["different case", "shop a"],
    ["organization name while a business exists", "Org a"],
    ["an object", { $ne: "" }],
  ])("deletes nothing when confirmName is %s", async (label, confirmName) => {
    const a = await tenant("a");
    const before = await snapshot(a.orgId);

    const res = await deleteAccount(a.orgId, confirmName);
    expect(res.status).toBe(400);
    expect(await snapshot(a.orgId)).toEqual(before);
  });

  it("accepts the organization name when no business exists yet", async () => {
    const reg = await request(app)
      .post("/api/auth/register")
      .send({ name: "P", email: "p@p.test", password: PASSWORD, organizationName: "Pending Co" });
    const orgId = reg.body.organization.id;

    expect((await deleteAccount(orgId, "Something else")).status).toBe(400);
    const res = await deleteAccount(orgId, " Pending Co ");
    expect(res.status).toBe(200);
    expect(res.body.deleted).toMatchObject({ businessName: "Pending Co", deleted: { users: 1, businesses: 0 } });
    expect(await Organization.exists({ _id: orgId })).toBeNull();
    expect(await User.exists({ email: "p@p.test" })).toBeNull();
  });

  it("refuses to delete an organization that contains a Super Admin", async () => {
    const a = await tenant("a");
    await User.create({
      name: "Embedded admin",
      email: "admin2@voiceloop.test",
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role: "superadmin",
      organizationId: a.orgId,
    });
    const before = await snapshot(a.orgId);

    const res = await deleteAccount(a.orgId, "Shop a");
    expect(res.status).toBe(403);
    expect(await snapshot(a.orgId)).toEqual(before);
    expect(await User.exists({ _id: admin._id })).toBeTruthy();
  });

  it("returns 404 for unknown or malformed ids", async () => {
    expect((await deleteAccount(new mongoose.Types.ObjectId(), "Anything")).status).toBe(404);
    expect((await deleteAccount("not-an-id", "Anything")).status).toBe(404);
  });
});

describe("deleting an account", () => {
  it("removes all of A's data and leaves B untouched", async () => {
    const a = await tenant("a");
    const b = await tenant("b");
    const bBefore = await snapshot(b.orgId);
    const aBefore = await snapshot(a.orgId);
    expect(aBefore.feedback).toHaveLength(4);
    expect(aBefore.files).toHaveLength(2);
    expect(aBefore.links).toHaveLength(2);
    expect(aBefore.audit.length).toBeGreaterThan(0);

    const res = await deleteAccount(a.orgId, "Shop a");
    expect(res.status).toBe(200);
    expect(res.body.deleted).toEqual({
      organizationId: a.orgId,
      businessName: "Shop a",
      deleted: { feedback: 4, links: 2, businesses: 1, users: 1 },
      files: { removed: 2, failed: 0 },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/@|password|Cold food|Private note/i);

    const aAfter = await snapshot(a.orgId);
    expect(aAfter.organization).toBeNull();
    expect(aAfter.users).toHaveLength(0);
    expect(aAfter.businesses).toHaveLength(0);
    expect(aAfter.links).toHaveLength(0);
    expect(aAfter.feedback).toHaveLength(0);
    expect(await storedFilesOf(a.business.id)).toEqual([]);
    expect(bBefore.files).toHaveLength(2);
    expect(await User.exists({ email: a.email })).toBeNull();
    expect(await Feedback.exists({ message: /at a$/ })).toBeNull();
    expect(await Feedback.exists({ "internalNotes.text": "Private note for a" })).toBeNull();
    expect(await Feedback.exists({ "statusHistory.resolutionSummary": "Refunded a" })).toBeNull();
    expect(await Feedback.exists({ "statusHistory.resolutionSummary": "Refunded b" })).toBeTruthy();

    // B: every document exactly as before, including its audit entries.
    expect(await snapshot(b.orgId)).toEqual(bBefore);
    // The Super Admin is never deleted.
    expect(await User.exists({ _id: admin._id })).toBeTruthy();
  });

  it("leaves no document in any organization-scoped collection (covers every model)", async () => {
    const a = await tenant("a");
    await tenant("b");
    expect((await deleteAccount(a.orgId, "Shop a")).status).toBe(200);

    const orgId = new mongoose.Types.ObjectId(a.orgId);
    // Every model with an organizationId must be emptied for this tenant, and
    // must be listed in ORGANIZATION_DATA. A new model that isn't fails here
    // (DELETION RULE in CLAUDE.md).
    const handled = new Set([...ORGANIZATION_DATA.map((d) => d.model.modelName), "Organization", "AuditLog"]);
    for (const name of mongoose.modelNames()) {
      const model = mongoose.model(name);
      if (model.schema.path("organizationId")) {
        expect(handled.has(name), `${name} has organizationId but isn't in ORGANIZATION_DATA`).toBe(true);
        expect(await model.countDocuments({ organizationId: orgId }), name).toBe(0);
      } else {
        expect(handled.has(name), `${name} isn't covered by the deletion service`).toBe(true);
      }
    }
    expect(await Organization.countDocuments({ _id: orgId })).toBe(0);

    // Every stored file type is listed in STORED_FILES, and storage keys are
    // prefixed with the business id, so nothing may remain under A's prefix.
    expect(STORED_FILES.map((f) => f.key)).toEqual(["audio"]);
    expect(await storedFilesOf(a.business.id)).toEqual([]);
  });

  it("still deletes the account if removing a stored file fails, and logs the key", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const a = await tenant("a");
    const [kept] = await Feedback.find({ organizationId: a.orgId, submissionType: "voice" }).sort({ _id: 1 });
    const storage = getStorage();
    const realDelete = storage.delete.bind(storage);
    vi.spyOn(storage, "delete").mockImplementation((key) =>
      key === kept.audioKey ? Promise.reject(new Error("Simulated storage outage")) : realDelete(key)
    );

    const res = await deleteAccount(a.orgId, "Shop a");
    expect(res.status).toBe(200);
    expect(res.body.deleted.files).toEqual({ removed: 1, failed: 1 });
    expect(JSON.stringify(res.body)).not.toContain(kept.audioKey);
    expect(await Organization.exists({ _id: a.orgId })).toBeNull();
    expect(await storedFilesOf(a.business.id)).toEqual([kept.audioKey.split("/")[1]]);
    expect(errors.mock.calls.some(([message]) => String(message).includes(kept.audioKey))).toBe(true);
  });

  it("keeps exactly one audit entry, with no email, password or feedback data", async () => {
    const a = await tenant("a");
    await deleteAccount(a.orgId, "Shop a");

    const entries = await AuditLog.find({ targetId: a.orgId }).lean();
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry).toMatchObject({ action: "account_deleted", targetType: "Organization", context: { businessName: "Shop a" } });
    expect(String(entry.actor)).toBe(String(admin._id));
    expect(String(entry.targetId)).toBe(a.orgId);
    expect(entry.createdAt).toBeInstanceOf(Date);
    expect(entry.actorEmail).toBeUndefined();

    const text = JSON.stringify(entry);
    expect(text).not.toMatch(/@/);
    expect(text).not.toMatch(/password|\$2[aby]\$/i);
    expect(text).not.toMatch(/Cold food|Great staff|Private note|guest/i);
  });

  it("invalidates the deleted owner's session and the public pages", async () => {
    const a = await tenant("a");
    expect((await request(app).get("/api/auth/me").set("Cookie", a.cookie)).status).toBe(200);
    expect((await request(app).get(`/api/public/f/${a.slug}`)).status).toBe(200);

    await deleteAccount(a.orgId, "Shop a");

    const me = await request(app).get("/api/auth/me").set("Cookie", a.cookie);
    expect(me.status).toBe(401);
    expect((await request(app).get("/api/business").set("Cookie", a.cookie)).status).toBe(401);

    for (const path of [`/api/public/f/${a.slug}`, `/api/public/f/${a.slug}/${a.link.code}`, `/api/public/business/${a.slug}`]) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(404);
      expect(res.body.error.message).toBe("This feedback page isn't available");
    }
    const submit = await request(app)
      .post(`/api/public/f/${a.slug}/submit`)
      .send({ category: "general", message: "Hello?", idempotencyKey: crypto.randomUUID() });
    expect(submit.status).toBe(404);
    expect(await Feedback.countDocuments()).toBe(0);
  });

  it("disappears from the Super Admin account list", async () => {
    const a = await tenant("a");
    await tenant("b");
    await deleteAccount(a.orgId, "Shop a");

    const list = await request(app).get("/api/super-admin/accounts").set("Cookie", adminCookie);
    expect(list.body.accounts.map((x) => x.businessName)).toEqual(["Shop b"]);
  });
});

describe("transaction safety", () => {
  it.each([
    ["deleting the organization", () => vi.spyOn(Organization, "deleteOne")],
    ["writing the audit entry", () => vi.spyOn(AuditLog, "create")],
    ["deleting users", () => vi.spyOn(User, "deleteMany")],
  ])("leaves everything in place if %s fails", async (label, spy) => {
    vi.spyOn(console, "error").mockImplementation(() => {}); // expected 500 log
    const a = await tenant("a");
    const before = await snapshot(a.orgId);

    spy().mockRejectedValueOnce(new Error(`Simulated failure: ${label}`));
    const res = await deleteAccount(a.orgId, "Shop a");
    expect(res.status).toBe(500);

    // Earlier steps (feedback, links, business...) were rolled back.
    expect(await snapshot(a.orgId)).toEqual(before);
    expect(await AuditLog.exists({ action: "account_deleted" })).toBeNull();

    // And it works once the failure is gone.
    vi.restoreAllMocks();
    expect((await deleteAccount(a.orgId, "Shop a")).status).toBe(200);
    expect(await Organization.exists({ _id: a.orgId })).toBeNull();
  });
});
