import { describe, it, expect, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import request from "supertest";
import bcrypt from "bcrypt";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Organization } from "../src/models/Organization.js";
import { FeedbackLink } from "../src/models/FeedbackLink.js";
import { Feedback } from "../src/models/Feedback.js";
import { AuditLog } from "../src/models/AuditLog.js";
import {
  DEFAULT_RETENTION_DAYS,
  retentionDaysFrom,
  retentionCutoff,
  runRetention,
  startRetentionSchedule,
} from "../src/services/retention.js";
import { getStorage, newAudioKey, StorageNotFoundError } from "../src/services/storage/index.js";
import { SESSION_COOKIE, signSession } from "../src/utils/session.js";

const app = createApp({ limits: { api: 10000, login: 1000, register: 1000, public: 10000, submit: 10000, export: 1000 } });
const PASSWORD = "correct-horse-battery";
const DAY = 24 * 60 * 60 * 1000;
// A fixed clock: every test passes `now`, so nothing depends on real time.
const NOW = new Date("2026-06-30T12:00:00Z");
const CUTOFF = retentionCutoff(DEFAULT_RETENTION_DAYS, NOW);
const daysAgo = (days) => new Date(NOW.getTime() - days * DAY);
const run = (options = {}) => runRetention({ days: DEFAULT_RETENTION_DAYS, now: NOW, ...options });

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.RETENTION_DAYS;
});

async function owner(label) {
  const reg = await request(app)
    .post("/api/auth/register")
    .send({ name: `Owner ${label}`, email: `${label}@${label}.test`, password: PASSWORD, organizationName: `Org ${label}` });
  const orgId = reg.body.organization.id;
  await Organization.updateOne({ _id: orgId }, { accessStatus: "active" });
  const cookie = reg.headers["set-cookie"].find((c) => c.startsWith(`${SESSION_COOKIE}=`)).split(";")[0];
  const business = (await request(app).post("/api/business").set("Cookie", cookie).send({ name: `Shop ${label}` })).body
    .business;
  const mainLink = await FeedbackLink.findOne({ businessId: business.id, isDefault: true });
  return { label, orgId, userId: reg.body.user.id, cookie, business, mainLink };
}

// Stores feedback directly with a backdated submittedAt. `voice: true` also
// stores a recording and returns its key on the document.
async function seed(o, { at, voice = false, ...overrides }) {
  const audio = voice ? { key: newAudioKey(o.business.id, "webm") } : null;
  if (audio) await getStorage().put(audio.key, Buffer.from("recording"));
  return Feedback.create({
    businessId: o.business.id,
    organizationId: o.orgId,
    linkId: o.mainLink._id,
    category: "general",
    message: voice ? "" : `Message from ${o.label} customer`,
    idempotencyKey: crypto.randomUUID(),
    submittedAt: at,
    ...(audio && {
      submissionType: "voice",
      audioKey: audio.key,
      audioMimeType: "audio/webm",
      audioSizeBytes: 9,
      audioDurationSec: 1,
      transcriptStatus: "unavailable",
    }),
    ...overrides,
  });
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

describe("RETENTION_DAYS", () => {
  it("defaults to 45 and accepts whole numbers from 1 to 3650", () => {
    expect(retentionDaysFrom({})).toBe(45);
    expect(retentionDaysFrom({ RETENTION_DAYS: "" })).toBe(45);
    expect(retentionDaysFrom({ RETENTION_DAYS: "1" })).toBe(1);
    expect(retentionDaysFrom({ RETENTION_DAYS: " 30 " })).toBe(30);
    expect(retentionDaysFrom({ RETENTION_DAYS: "3650" })).toBe(3650);
  });

  it("refuses anything else", () => {
    for (const value of ["0", "3651", "-5", "1.5", "45d", "abc", "1e3", "0x10"]) {
      expect(() => retentionDaysFrom({ RETENTION_DAYS: value }), value).toThrow(/RETENTION_DAYS must be a whole number/);
    }
  });

  it("is returned by the summary, list, detail and analytics responses", async () => {
    const a = await owner("a");
    const item = await seed(a, { at: new Date() });
    const get = (path) => request(app).get(path).set("Cookie", a.cookie);

    for (const days of [45, 30]) {
      if (days !== 45) process.env.RETENTION_DAYS = String(days);
      for (const path of ["/api/feedback/summary", "/api/feedback", `/api/feedback/${item._id}`, "/api/analytics"]) {
        const res = await get(path);
        expect(res.status, path).toBe(200);
        expect(res.body.retentionDays, path).toBe(days);
      }
    }
  });
});

describe("runRetention", () => {
  it("deletes items older than the cutoff whatever their status, and keeps newer ones", async () => {
    const a = await owner("a");
    const by = new User()._id;
    const old = await Promise.all([
      // An unresolved complaint with internal notes and history.
      seed(a, {
        at: daysAgo(60),
        category: "complaint",
        complaintStatus: "in_progress",
        reviewStatus: "reviewed",
        internalNotes: [{ authorId: by, text: "Calling the customer back" }],
        statusHistory: [{ field: "complaintStatus", from: "open", to: "in_progress", by }],
      }),
      seed(a, { at: daysAgo(46), category: "complaint", complaintStatus: "open" }),
      seed(a, { at: daysAgo(400), reviewStatus: "new" }),
    ]);
    const kept = await Promise.all([seed(a, { at: daysAgo(44) }), seed(a, { at: daysAgo(1) }), seed(a, { at: NOW })]);

    const result = await run();

    expect(result).toMatchObject({ feedback: 3, audioFiles: 0, failedFiles: 0 });
    expect(result.cutoff).toEqual(CUTOFF);
    expect(await Feedback.countDocuments({ _id: { $in: old.map((f) => f._id) } })).toBe(0);
    expect((await Feedback.find().select("_id").lean()).map((f) => String(f._id)).sort()).toEqual(
      kept.map((f) => String(f._id)).sort()
    );
  });

  it("respects the boundary: exactly at the cutoff is kept, a millisecond earlier is deleted", async () => {
    const a = await owner("a");
    const atCutoff = await seed(a, { at: CUTOFF });
    const justBefore = await seed(a, { at: new Date(CUTOFF.getTime() - 1) });

    expect((await run()).feedback).toBe(1);
    expect(await Feedback.exists({ _id: atCutoff._id })).toBeTruthy();
    expect(await Feedback.exists({ _id: justBefore._id })).toBeNull();
  });

  it("removes the recordings of deleted items and keeps those of kept items", async () => {
    const a = await owner("a");
    const oldVoice = await seed(a, { at: daysAgo(50), voice: true });
    const newVoice = await seed(a, { at: daysAgo(10), voice: true });

    expect(await run()).toMatchObject({ feedback: 1, audioFiles: 1, failedFiles: 0 });
    expect(await fileExists(oldVoice.audioKey)).toBe(false);
    expect(await fileExists(newVoice.audioKey)).toBe(true);
  });

  it("keeps going when a file can't be removed, and logs only its key", async () => {
    const a = await owner("a");
    const voices = [];
    for (let i = 0; i < 3; i++) voices.push(await seed(a, { at: daysAgo(50 + i), voice: true }));
    await seed(a, { at: daysAgo(55), message: "Secret complaint text" });
    const failing = voices[1].audioKey;

    const storage = getStorage();
    const realDelete = storage.delete.bind(storage);
    vi.spyOn(storage, "delete").mockImplementation((key) =>
      key === failing ? Promise.reject(new Error("disk unavailable")) : realDelete(key)
    );
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await run({ batchSize: 2 })).toMatchObject({ feedback: 4, audioFiles: 2, failedFiles: 1 });
    expect(await Feedback.countDocuments()).toBe(0);
    expect(await fileExists(voices[0].audioKey)).toBe(false);
    expect(await fileExists(voices[2].audioKey)).toBe(false);
    expect(await fileExists(failing)).toBe(true);

    const logged = errors.mock.calls.map((call) => call.map(String).join(" ")).join("\n");
    expect(logged).toContain(failing);
    expect(logged).not.toContain("Secret complaint text");
  });

  it("works across several batches", async () => {
    const a = await owner("a");
    for (let i = 0; i < 7; i++) await seed(a, { at: daysAgo(46 + i), voice: i % 2 === 0 });
    await seed(a, { at: daysAgo(3) });
    const deletes = vi.spyOn(Feedback, "deleteMany");

    expect(await run({ batchSize: 3 })).toMatchObject({ feedback: 7, audioFiles: 4, failedFiles: 0 });
    expect(deletes).toHaveBeenCalledTimes(3);
    expect(await Feedback.countDocuments()).toBe(1);
  });

  it("doesn't double-delete or fail when two runs overlap", async () => {
    const a = await owner("a");
    for (let i = 0; i < 5; i++) await seed(a, { at: daysAgo(50), voice: i < 2 });

    const results = await Promise.all([run({ batchSize: 2 }), run({ batchSize: 2 })]);

    expect(results.filter((r) => r.skipped)).toHaveLength(1);
    expect(results.find((r) => !r.skipped)).toMatchObject({ feedback: 5, audioFiles: 2 });
    expect(await Feedback.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments({ action: "retention.cleanup" })).toBe(1);
    // The next run finds nothing left and writes no entry.
    expect(await run()).toMatchObject({ feedback: 0 });
    expect(await AuditLog.countDocuments({ action: "retention.cleanup" })).toBe(1);
  });

  it("dry run only counts", async () => {
    const a = await owner("a");
    const oldVoice = await seed(a, { at: daysAgo(50), voice: true });
    await seed(a, { at: daysAgo(48) });
    await seed(a, { at: daysAgo(2) });
    const deletes = vi.spyOn(Feedback, "deleteMany");
    const fileDeletes = vi.spyOn(getStorage(), "delete");

    expect(await run({ dryRun: true })).toEqual({ cutoff: CUTOFF, feedback: 2, audioFiles: 1, dryRun: true });
    expect(deletes).not.toHaveBeenCalled();
    expect(fileDeletes).not.toHaveBeenCalled();
    expect(await Feedback.countDocuments()).toBe(3);
    expect(await fileExists(oldVoice.audioKey)).toBe(true);
    expect(await AuditLog.countDocuments({ action: "retention.cleanup" })).toBe(0);
  });

  it("leaves other tenants' newer data untouched, and no other collection", async () => {
    const a = await owner("a");
    const b = await owner("b");
    await seed(a, { at: daysAgo(50) });
    const bNew = await seed(b, {
      at: daysAgo(5),
      category: "complaint",
      complaintStatus: "open",
      internalNotes: [{ authorId: b.userId, text: "Follow up" }],
    });
    const bVoice = await seed(b, { at: daysAgo(5), voice: true });
    const counts = async () => ({
      users: await User.countDocuments(),
      orgs: await Organization.countDocuments(),
      links: await FeedbackLink.countDocuments(),
    });
    const before = await counts();

    expect((await run()).feedback).toBe(1);
    expect(await Feedback.findById(bNew._id).lean()).toMatchObject({ complaintStatus: "open", internalNotes: [{ text: "Follow up" }] });
    expect(await fileExists(bVoice.audioKey)).toBe(true);
    expect(await Feedback.countDocuments({ organizationId: a.orgId })).toBe(0);
    expect(await counts()).toEqual(before);
  });
});

describe("audit entry", () => {
  it("records counts and the cutoff only, once per run that deleted something", async () => {
    const a = await owner("a");
    await seed(a, { at: daysAgo(50), message: "Private words", customerEmail: "guest@a.test", customerName: "Guest A" });
    await seed(a, { at: daysAgo(50), voice: true });

    const retentionEntries = () => AuditLog.find({ action: "retention.cleanup" }).lean();
    expect((await run({ now: daysAgo(100) })).feedback).toBe(0);
    expect(await retentionEntries()).toHaveLength(0);

    await run();
    const entries = await retentionEntries();
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry).toMatchObject({ action: "retention.cleanup", targetType: "Platform" });
    expect(entry.context).toEqual({ feedbackDeleted: 2, audioFilesDeleted: 1, cutoff: CUTOFF });
    // No actor, no target, nothing that points at an organization or business.
    expect(entry.actor).toBeUndefined();
    expect(entry.targetId).toBeUndefined();
    const stored = JSON.stringify(entry);
    for (const value of ["Private words", "guest@a.test", "Guest A", a.orgId, a.business.id]) {
      expect(stored).not.toContain(value);
    }
  });

  it("shows in the Super Admin audit log", async () => {
    const a = await owner("a");
    await seed(a, { at: daysAgo(50) });
    await run();
    const admin = await User.create({
      name: "Ops",
      email: "ops@voiceloop.test",
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role: "superadmin",
    });

    const res = await request(app)
      .get("/api/super-admin/audit-logs?action=retention.cleanup")
      .set("Cookie", `${SESSION_COOKIE}=${signSession(admin._id)}`);
    expect(res.status).toBe(200);
    const [entry] = res.body.entries;
    expect(entry).toMatchObject({
      action: "retention.cleanup",
      actor: null,
      target: { type: "Platform" },
      context: { feedbackDeleted: 1, audioFilesDeleted: 0 },
    });
  });
});

describe("analytics and CSV after deletion", () => {
  it("no longer include deleted items", async () => {
    const a = await owner("a");
    // Real time here: the analytics range and the cutoff both use today.
    const now = new Date();
    await seed(a, { at: new Date(now.getTime() - 50 * DAY), message: "Old expired feedback" });
    await seed(a, { at: new Date(now.getTime() - 2 * DAY), message: "Recent feedback" });
    const from = new Date(now.getTime() - 60 * DAY).toISOString().slice(0, 10);
    const analytics = () => request(app).get(`/api/analytics?from=${from}&tz=UTC`).set("Cookie", a.cookie);
    const csv = () => request(app).get("/api/feedback/export.csv").set("Cookie", a.cookie).buffer(true);

    expect((await analytics()).body.total).toBe(2);
    expect((await csv()).text).toContain("Old expired feedback");

    await runRetention({ days: 45, now });

    expect((await analytics()).body.total).toBe(1);
    const after = await csv();
    expect(after.status).toBe(200);
    expect(after.text).not.toContain("Old expired feedback");
    expect(after.text).toContain("Recent feedback");
  });
});

describe("startRetentionSchedule", () => {
  it("runs once in the background with an unref'd timer, logging errors instead of throwing", async () => {
    const a = await owner("a");
    await seed(a, { at: new Date(Date.now() - 50 * DAY) });
    vi.spyOn(console, "log").mockImplementation(() => {});

    const { timer, firstRun } = startRetentionSchedule();
    try {
      expect(timer.hasRef()).toBe(false);
      await firstRun;
      expect(await Feedback.countDocuments()).toBe(0);
    } finally {
      clearInterval(timer);
    }

    process.env.RETENTION_DAYS = "nope";
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const second = startRetentionSchedule();
    clearInterval(second.timer);
    await expect(second.firstRun).resolves.toBeUndefined();
    expect(errors.mock.calls[0][0]).toBe("[retention] run failed:");
  });
});
