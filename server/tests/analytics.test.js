import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import request from "supertest";
import bcrypt from "bcrypt";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Organization } from "../src/models/Organization.js";
import { FeedbackLink } from "../src/models/FeedbackLink.js";
import { Feedback } from "../src/models/Feedback.js";
import { keywordCounts, tokenize } from "../src/services/keywords.js";
import { SESSION_COOKIE, signSession } from "../src/utils/session.js";

const app = createApp({ limits: { api: 10000, login: 1000, register: 1000, public: 10000, submit: 10000 } });
const PASSWORD = "correct-horse-battery";
const HOUR = 60 * 60 * 1000;
// A fixed May 2026 window, so results don't depend on today's date.
const MAY = "from=2026-05-01&to=2026-05-10&tz=UTC";

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
  return {
    label,
    orgId,
    cookie,
    business,
    mainLink,
    analytics: (query = MAY) => request(app).get(`/api/analytics?${query}`).set("Cookie", cookie),
  };
}

// Stores feedback directly, so tests control dates, links and history.
function seed(o, { at, ...overrides } = {}) {
  const category = overrides.category ?? "general";
  return Feedback.create({
    businessId: o.business.id,
    organizationId: o.orgId,
    linkId: o.mainLink._id,
    category,
    message: `Feedback for ${o.label}`,
    complaintStatus: category === "complaint" ? "open" : null,
    idempotencyKey: crypto.randomUUID(),
    submittedAt: new Date(at ?? "2026-05-03T12:00:00Z"),
    ...overrides,
  });
}

const voice = { submissionType: "voice", message: "", audioKey: "k", audioMimeType: "audio/webm", audioSizeBytes: 1000, transcriptStatus: "unavailable" };

// A complaint resolved (and possibly reopened) at the given times.
function complaint(o, { at, history = [], status }) {
  return seed(o, {
    at,
    category: "complaint",
    complaintStatus: status,
    statusHistory: history.map(([to, when], i) => ({
      field: "complaintStatus",
      from: i === 0 ? "open" : history[i - 1][0],
      to,
      by: o.business.id, // any ObjectId; names aren't resolved here
      at: new Date(when),
      ...(to === "resolved" && { resolutionSummary: "Done" }),
    })),
  });
}

describe("access", () => {
  it("refuses logged-out, pending, suspended and Super Admin callers", async () => {
    const a = await owner("a");
    expect((await request(app).get(`/api/analytics?${MAY}`)).status).toBe(401);

    const pending = await request(app)
      .post("/api/auth/register")
      .send({ name: "P", email: "p@p.test", password: PASSWORD, organizationName: "P org" });
    const pendingRes = await request(app).get("/api/analytics").set("Cookie", pending.headers["set-cookie"][0].split(";")[0]);
    expect(pendingRes.status).toBe(403);
    expect(pendingRes.body.error.code).toBe("ACCESS_PENDING");

    const admin = await User.create({
      name: "Ops",
      email: "ops@voiceloop.test",
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role: "superadmin",
    });
    const adminRes = await request(app).get("/api/analytics").set("Cookie", `${SESSION_COOKIE}=${signSession(admin._id)}`);
    expect(adminRes.status).toBe(403);
    expect(adminRes.body.error.code).toBe("FORBIDDEN");

    await Organization.updateOne({ _id: a.orgId }, { accessStatus: "suspended" });
    const suspended = await a.analytics();
    expect(suspended.status).toBe(403);
    expect(suspended.body.error.code).toBe("ACCESS_SUSPENDED");
  });
});

describe("GET /api/analytics", () => {
  it("counts only the owner's own business", async () => {
    const a = await owner("a");
    const b = await owner("b");
    await seed(a, { category: "complaint", message: "cold coffee" });
    for (let i = 0; i < 4; i++) await seed(b, { category: "complaint", message: `cold coffee again ${i}` });
    await FeedbackLink.create({ businessId: b.business.id, organizationId: b.orgId, name: "B only", code: "bonly123" });

    const res = await a.analytics();
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.complaints.received).toBe(1);
    expect(res.body.byLink.map((l) => l.name)).toEqual(["Main link"]);
    expect(res.body.keywords.items).toEqual([]); // B's repeated words don't leak in
    expect(JSON.stringify(res.body)).not.toContain(b.business.id);
  });

  it("matches the seeded data: per day, category, source (with zero-count links), type", async () => {
    const a = await owner("a");
    const table = await FeedbackLink.create({ businessId: a.business.id, organizationId: a.orgId, name: "Table 4", code: "table444" });
    await FeedbackLink.create({ businessId: a.business.id, organizationId: a.orgId, name: "Unused", code: "unused44", isActive: false });

    await seed(a, { at: "2026-05-01T00:00:00Z" }); // first instant of the range
    await seed(a, { at: "2026-05-01T23:59:59Z", category: "compliment", linkId: table._id });
    await seed(a, { at: "2026-05-03T08:00:00Z", category: "complaint", ...voice });
    await seed(a, { at: "2026-05-10T23:59:59Z", category: "suggestion", linkId: null }); // last instant
    await seed(a, { at: "2026-04-30T23:59:59Z" }); // just before
    await seed(a, { at: "2026-05-11T00:00:00Z" }); // just after

    const { body } = await a.analytics();
    expect(body.range).toEqual({ from: "2026-05-01", to: "2026-05-10", timeZone: "UTC", days: 10 });
    expect(body.total).toBe(4);
    expect(body.volume).toHaveLength(10);
    expect(body.volume[0]).toEqual({ date: "2026-05-01", count: 2 });
    expect(body.volume[2]).toEqual({ date: "2026-05-03", count: 1 });
    expect(body.volume[9]).toEqual({ date: "2026-05-10", count: 1 });
    expect(body.volume.reduce((sum, d) => sum + d.count, 0)).toBe(4);
    expect(body.byCategory).toEqual([
      { category: "general", count: 1 },
      { category: "complaint", count: 1 },
      { category: "suggestion", count: 1 },
      { category: "compliment", count: 1 },
      { category: "other", count: 0 },
    ]);
    expect(body.byLink.map(({ name, count, isActive }) => ({ name, count, isActive }))).toEqual([
      { name: "Main link", count: 2, isActive: true },
      { name: "Table 4", count: 1, isActive: true },
      { name: "Unused", count: 0, isActive: false },
    ]);
    expect(body.unlinkedCount).toBe(1);
    expect(body.bySubmissionType).toEqual({ text: 3, voice: 1 });
  });

  it("groups days and range edges in the requested time zone", async () => {
    const a = await owner("a");
    // 20:00 UTC on 1 May is 01:30 on 2 May in India (UTC+5:30).
    await seed(a, { at: "2026-05-01T20:00:00Z" });

    const kolkata = (await a.analytics("from=2026-05-02&to=2026-05-02&tz=Asia/Kolkata")).body;
    expect(kolkata.total).toBe(1);
    expect(kolkata.volume).toEqual([{ date: "2026-05-02", count: 1 }]);

    const utc = (await a.analytics("from=2026-05-02&to=2026-05-02&tz=UTC")).body;
    expect(utc.total).toBe(0);
  });

  it("computes complaint stats and the average time to the latest resolution", async () => {
    const a = await owner("a");
    // Resolved after 10 hours.
    await complaint(a, { at: "2026-05-01T00:00:00Z", status: "resolved", history: [["resolved", "2026-05-01T10:00:00Z"]] });
    // Resolved, reopened, resolved again 48 hours after submission: the latest counts.
    await complaint(a, {
      at: "2026-05-02T00:00:00Z",
      status: "resolved",
      history: [["resolved", "2026-05-03T08:00:00Z"], ["open", "2026-05-03T09:00:00Z"], ["resolved", "2026-05-04T00:00:00Z"]],
    });
    // Submitted before the range, resolved in it after 48 hours: counts as resolved in range.
    await complaint(a, { at: "2026-04-30T00:00:00Z", status: "resolved", history: [["resolved", "2026-05-02T00:00:00Z"]] });
    // Submitted in the range, resolved after it: not resolved in range.
    await complaint(a, { at: "2026-05-05T00:00:00Z", status: "resolved", history: [["resolved", "2026-06-15T00:00:00Z"]] });
    // Resolved in the range but reopened since: currently open, not counted.
    await complaint(a, {
      at: "2026-05-05T00:00:00Z",
      status: "open",
      history: [["resolved", "2026-05-06T00:00:00Z"], ["open", "2026-05-07T00:00:00Z"]],
    });
    await complaint(a, { at: "2026-05-06T00:00:00Z", status: "in_progress", history: [["in_progress", "2026-05-06T01:00:00Z"]] });
    await complaint(a, { at: "2026-05-07T00:00:00Z", status: "open" });
    await seed(a, { at: "2026-05-07T00:00:00Z", category: "general" }); // not a complaint

    const { complaints } = (await a.analytics()).body;
    expect(complaints).toEqual({
      received: 6, // the one submitted in April isn't
      open: 2,
      inProgress: 1,
      resolved: 3,
      resolvedInRange: 3,
      averageHoursToResolve: 35.3, // (10 + 48 + 48) / 3
    });
  });

  it("returns zeros, no average and no keywords for a business with no feedback", async () => {
    const a = await owner("a");
    const { body } = await a.analytics();
    expect(body.total).toBe(0);
    expect(body.volume.every((d) => d.count === 0)).toBe(true);
    expect(body.byLink).toEqual([expect.objectContaining({ name: "Main link", count: 0 })]);
    expect(body.complaints).toEqual({ received: 0, open: 0, inProgress: 0, resolved: 0, resolvedInRange: 0, averageHoursToResolve: null });
    expect(body.keywords).toMatchObject({ method: "keyword counts", minCount: 3, complaintsAnalyzed: 0, items: [] });
  });

  it("counts complaint keywords in the range, ignoring stopwords, other categories and rare terms", async () => {
    const a = await owner("a");
    for (const message of [
      "The coffee was cold and the staff were rude.",
      "COLD COFFEE again!! The worst.",
      "My cold coffee... it was the third time",
      "Rude staff at the counter",
    ]) {
      await seed(a, { category: "complaint", message });
    }
    // Same words outside complaints or outside the range don't count.
    for (let i = 0; i < 3; i++) await seed(a, { category: "general", message: "rude staff rude staff" });
    await seed(a, { category: "complaint", message: "rude staff", at: "2026-06-01T00:00:00Z" });

    const { keywords } = (await a.analytics()).body;
    expect(keywords.method).toBe("keyword counts");
    expect(keywords.description).toMatch(/Not AI/);
    expect(keywords.complaintsAnalyzed).toBe(4);
    expect(keywords.items).toEqual([
      { term: "coffee", count: 3 },
      { term: "cold", count: 3 },
    ]);
  });

  it("rejects invalid dates, ranges, time zones and repeated or bracketed keys", async () => {
    const a = await owner("a");
    const cases = [
      ["from=2026-13-01&to=2026-12-31", "from"],
      ["from=2026-02-30&to=2026-03-01", "from"],
      ["from=05/01/2026&to=2026-05-10", "from"],
      ["from=2026-05-10&to=2026-05-01", "to"],
      ["from=2025-01-01&to=2026-01-02", "from"], // 367 days
      ["tz=Mars/Olympus_Mons", "tz"],
      ["tz=UTC&tz=UTC", "tz"],
      ["from=2026-05-01&from=2026-05-02&to=2026-05-10", "from"],
      ["from[$gt]=2000-01-01&to[$lt]=2100-01-01", null],
    ];
    for (const [query, field] of cases) {
      const res = await a.analytics(query);
      if (field) {
        expect(res.status, query).toBe(400);
        expect(res.body.error.details, query).toHaveProperty(field);
      } else {
        // Bracket syntax never becomes an operator object: the keys are
        // simply unknown and the default range applies.
        expect(res.status, query).toBe(200);
        expect(res.body.range.days).toBe(30);
      }
    }
    expect((await a.analytics("from=2025-01-02&to=2026-01-02")).status).toBe(200); // 366 days
  });

  it("defaults to the last 30 days, ending today in the given time zone", async () => {
    const a = await owner("a");
    await seed(a, { at: new Date().toISOString() });
    const { body } = await a.analytics("tz=UTC");
    expect(body.range.days).toBe(30);
    expect(body.range.to).toBe(new Date().toISOString().slice(0, 10));
    expect(body.total).toBe(1);
  });
});

describe("keywordCounts", () => {
  it("strips punctuation and apostrophes and lowercases", () => {
    expect(tokenize("Don't! Wait—the CAFÉ's 2nd floor.")).toEqual(["dont", "wait", "the", "cafés", "2nd", "floor"]);
  });

  it("applies the threshold, counts a term once per text, and breaks phrases at stopwords", () => {
    const texts = ["slow slow slow service", "slow service", "service was slow", "very slow service"];
    expect(keywordCounts(texts)).toEqual([
      { term: "service", count: 4 },
      { term: "slow", count: 4 },
      { term: "slow service", count: 3 },
    ]);
    expect(keywordCounts(texts, { minCount: 5 })).toEqual([]);
    expect(keywordCounts(["the and of it", "the and of it", "the and of it"])).toEqual([]);
    expect(keywordCounts(["table 4 is 4", "table 4", "table 4"])).toEqual([{ term: "table", count: 3 }]);
  });

  it("returns at most 10 terms", () => {
    const words = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima".split(" ");
    const texts = [0, 1, 2].map(() => words.join(". "));
    expect(keywordCounts(texts)).toHaveLength(10);
  });
});
