import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import request from "supertest";
import bcrypt from "bcrypt";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Organization } from "../src/models/Organization.js";
import { FeedbackLink } from "../src/models/FeedbackLink.js";
import { Feedback } from "../src/models/Feedback.js";
import { SESSION_COOKIE, signSession } from "../src/utils/session.js";

const app = createApp({ limits: { api: 10000, login: 1000, register: 1000, public: 10000, submit: 10000 } });
const PASSWORD = "correct-horse-battery";
const DAY = 24 * 60 * 60 * 1000;

// An active owner with a business, plus helpers that send their session.
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

  const call = (method, path, body) => request(app)[method](`/api/feedback${path}`).set("Cookie", cookie).send(body);
  return {
    label,
    orgId,
    cookie,
    userId: reg.body.user.id,
    business,
    mainLink,
    list: (query = "") => call("get", `/${query ? `?${query}` : ""}`),
    get: (id) => call("get", `/${id}`),
    summary: (query = "") => call("get", `/summary${query ? `?${query}` : ""}`),
    review: (id, body) => call("patch", `/${id}/review`, body),
    complaint: (id, body) => call("patch", `/${id}/complaint-status`, body),
    note: (id, body) => call("post", `/${id}/notes`, body),
  };
}

// Stores feedback directly so tests can control dates and links.
async function seed(o, overrides = {}) {
  const category = overrides.category ?? "general";
  return Feedback.create({
    businessId: o.business.id,
    organizationId: o.orgId,
    linkId: o.mainLink._id,
    category,
    message: `Feedback for ${o.label}`,
    complaintStatus: category === "complaint" ? "open" : null,
    idempotencyKey: crypto.randomUUID(),
    ...overrides,
  });
}

const ids = (res) => res.body.feedback.map((f) => String(f.id));

describe("access", () => {
  it("refuses logged-out, pending, suspended and Super Admin callers on every route", async () => {
    const a = await owner("a");
    const f = await seed(a, { category: "complaint" });
    const routes = [
      ["get", "/"],
      ["get", "/summary"],
      ["get", `/${f._id}`],
      ["patch", `/${f._id}/review`],
      ["patch", `/${f._id}/complaint-status`],
      ["post", `/${f._id}/notes`],
    ];
    const body = { reviewStatus: "reviewed", status: "in_progress", text: "hi" };

    for (const [method, path] of routes) {
      expect((await request(app)[method](`/api/feedback${path}`).send(body)).status, `anon ${path}`).toBe(401);
    }

    const pending = await request(app)
      .post("/api/auth/register")
      .send({ name: "P", email: "p@p.test", password: PASSWORD, organizationName: "P org" });
    const pendingCookie = pending.headers["set-cookie"][0].split(";")[0];

    const admin = await User.create({
      name: "Ops",
      email: "ops@voiceloop.test",
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role: "superadmin",
    });
    const adminCookie = `${SESSION_COOKIE}=${signSession(admin._id)}`;

    for (const [who, cookie, code] of [
      ["pending", pendingCookie, "ACCESS_PENDING"],
      ["super admin", adminCookie, "FORBIDDEN"],
    ]) {
      for (const [method, path] of routes) {
        const res = await request(app)[method](`/api/feedback${path}`).set("Cookie", cookie).send(body);
        expect(res.status, `${who} ${method} ${path}`).toBe(403);
        expect(res.body.error.code).toBe(code);
      }
    }

    await Organization.updateOne({ _id: a.orgId }, { accessStatus: "suspended" });
    for (const [method, path] of routes) {
      const res = await request(app)[method](`/api/feedback${path}`).set("Cookie", a.cookie).send(body);
      expect(res.status, `suspended ${path}`).toBe(403);
      expect(res.body.error.code).toBe("ACCESS_SUSPENDED");
    }

    const unchanged = await Feedback.findById(f._id);
    expect(unchanged).toMatchObject({ reviewStatus: "new", complaintStatus: "open" });
    expect(unchanged.internalNotes).toHaveLength(0);
    expect(unchanged.statusHistory).toHaveLength(0);
  });

  it("returns NO_BUSINESS for an active owner who hasn't set up a business", async () => {
    const reg = await request(app)
      .post("/api/auth/register")
      .send({ name: "N", email: "n@n.test", password: PASSWORD, organizationName: "N org" });
    await Organization.updateOne({ _id: reg.body.organization.id }, { accessStatus: "active" });
    const res = await request(app).get("/api/feedback").set("Cookie", reg.headers["set-cookie"][0].split(";")[0]);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NO_BUSINESS");
  });
});

describe("tenant isolation", () => {
  it("owner A can't list, read, review, resolve or note owner B's feedback", async () => {
    const a = await owner("a");
    const b = await owner("b");
    const aFeedback = await seed(a);
    const bComplaint = await seed(b, { category: "complaint", message: "B private complaint" });
    const bLink = await FeedbackLink.create({
      businessId: b.business.id,
      organizationId: b.orgId,
      name: "B patio",
      code: "bpatio01",
    });
    await seed(b, { linkId: bLink._id });

    // Listing: only A's, whatever ids or filters point at B.
    expect(ids(await a.list())).toEqual([String(aFeedback._id)]);
    expect((await a.list(`linkId=${bLink._id}`)).body.total).toBe(0);
    expect((await a.list(`linkId=${b.mainLink._id}`)).body.total).toBe(0);
    expect(ids(await a.list(`businessId=${b.business.id}&organizationId=${b.orgId}`))).toEqual([String(aFeedback._id)]);
    expect((await a.list("q=B%20private")).body.total).toBe(0);

    // Direct access by B's id.
    expect((await a.get(bComplaint._id)).status).toBe(404);
    expect((await a.review(bComplaint._id, { reviewStatus: "reviewed" })).status).toBe(404);
    expect((await a.complaint(bComplaint._id, { status: "resolved", resolutionSummary: "Hijacked" })).status).toBe(404);
    expect((await a.note(bComplaint._id, { text: "Planted note" })).status).toBe(404);

    const bAfter = await Feedback.findById(bComplaint._id);
    expect(bAfter).toMatchObject({ reviewStatus: "new", complaintStatus: "open", resolutionSummary: "" });
    expect(bAfter.internalNotes).toHaveLength(0);
    expect(bAfter.statusHistory).toHaveLength(0);

    // Summary counts only A's.
    const summary = (await a.summary()).body;
    expect(summary.total).toBe(1);
    expect(summary.byLink.map((l) => l.name)).toEqual(["Main link"]);
    expect(JSON.stringify(summary)).not.toContain(String(bLink._id));
  });

  it("returns no organization or business ids in list and detail responses", async () => {
    const a = await owner("a");
    const f = await seed(a, { customerEmail: "guest@example.com" });
    for (const res of [await a.list(), await a.get(f._id), await a.summary()]) {
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(a.orgId);
      expect(text).not.toContain(String(a.business.id));
      expect(text).not.toMatch(/organizationId|businessId|idempotencyKey/);
    }
    // The list doesn't carry customer emails; the detail page does.
    expect(JSON.stringify((await a.list()).body)).not.toContain("guest@example.com");
    expect((await a.get(f._id)).body.feedback.customerEmail).toBe("guest@example.com");
  });
});

describe("GET /api/feedback", () => {
  it("paginates newest first without overlap", async () => {
    const a = await owner("a");
    const now = Date.now();
    for (let i = 0; i < 25; i++) await seed(a, { message: `Item ${i}`, submittedAt: new Date(now - i * 60_000) });

    const pages = await Promise.all([1, 2, 3].map((p) => a.list(`limit=10&page=${p}`)));
    expect(pages.map((p) => p.body.feedback.length)).toEqual([10, 10, 5]);
    expect(pages[0].body).toMatchObject({ total: 25, totalPages: 3, page: 1, limit: 10 });
    const all = pages.flatMap((p) => p.body.feedback.map((f) => f.excerpt));
    expect(all).toEqual(Array.from({ length: 25 }, (_, i) => `Item ${i}`));

    for (const bad of ["limit=51", "limit=0", "page=0", "page=abc", "limit=10&limit=20"]) {
      expect((await a.list(bad)).status, bad).toBe(400);
    }
  });

  it("filters by category, review status, complaint status, link and date range", async () => {
    const a = await owner("a");
    const patio = await FeedbackLink.create({ businessId: a.business.id, organizationId: a.orgId, name: "Patio", code: "patio001" });
    const now = Date.now();
    const old = await seed(a, { category: "compliment", submittedAt: new Date(now - 10 * DAY) });
    const reviewed = await seed(a, { category: "suggestion", reviewStatus: "reviewed", submittedAt: new Date(now - 5 * DAY) });
    const open = await seed(a, { category: "complaint", linkId: patio._id, submittedAt: new Date(now - 2 * DAY) });
    const resolved = await seed(a, { category: "complaint", complaintStatus: "resolved", submittedAt: new Date(now - DAY) });

    expect(ids(await a.list("category=complaint")).sort()).toEqual([String(open._id), String(resolved._id)].sort());
    expect(ids(await a.list("reviewStatus=reviewed"))).toEqual([String(reviewed._id)]);
    expect(ids(await a.list("complaintStatus=open"))).toEqual([String(open._id)]);
    expect(ids(await a.list("complaintStatus=resolved"))).toEqual([String(resolved._id)]);
    expect(ids(await a.list(`linkId=${patio._id}`))).toEqual([String(open._id)]);

    const from = new Date(now - 6 * DAY).toISOString();
    const to = new Date(now - 1.5 * DAY).toISOString();
    expect(ids(await a.list(`from=${from}&to=${to}`))).toEqual([String(open._id), String(reviewed._id)]);
    expect(ids(await a.list(`to=${new Date(now - 7 * DAY).toISOString()}`))).toEqual([String(old._id)]);

    // Combined filters narrow further.
    expect(ids(await a.list(`category=complaint&linkId=${patio._id}&reviewStatus=new`))).toEqual([String(open._id)]);

    for (const bad of ["category=spam", "reviewStatus=done", "complaintStatus=closed", "linkId=nope", "from=yesterday", `from=${to}&to=${from}`]) {
      expect((await a.list(bad)).status, bad).toBe(400);
    }
  });

  it("searches message text case-insensitively, treating regex characters literally", async () => {
    const a = await owner("a");
    const price = await seed(a, { message: "The price was $5.00 (too much)" });
    await seed(a, { message: "The price was 5500 rupees" });
    const dots = await seed(a, { message: "Wi-Fi password is a.*b?" });

    expect(ids(await a.list(`q=${encodeURIComponent("$5.00 (")}`))).toEqual([String(price._id)]);
    expect(ids(await a.list("q=PRICE")).length).toBe(2);
    expect(ids(await a.list(`q=${encodeURIComponent("a.*b?")}`))).toEqual([String(dots._id)]);
    expect((await a.list(`q=${encodeURIComponent(".*")}`)).body.total).toBe(1);
    expect((await a.list(`q=${encodeURIComponent("[")}`)).status).toBe(200);
    expect((await a.list(`q=${encodeURIComponent("(((")}`)).body.total).toBe(0);
  });

  it("returns the link name and a short excerpt", async () => {
    const a = await owner("a");
    await seed(a, { message: "x".repeat(500), customerName: "Priya" });
    const [item] = (await a.list()).body.feedback;
    expect(item.link.name).toBe("Main link");
    expect(item.excerpt.length).toBeLessThan(200);
    expect(item.customerName).toBe("Priya");
    expect(item).not.toHaveProperty("message");
  });
});

describe("review status", () => {
  it("marks reviewed and back to new, recording each change once with its actor", async () => {
    const a = await owner("a");
    const f = await seed(a);

    const reviewed = await a.review(f._id, { reviewStatus: "reviewed", category: "complaint" });
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.feedback).toMatchObject({ reviewStatus: "reviewed", category: "general" });
    expect(reviewed.body.feedback.statusHistory).toEqual([
      expect.objectContaining({ field: "reviewStatus", from: "new", to: "reviewed", by: { id: a.userId, name: "Owner a" } }),
    ]);

    // Same state again: no new history entry.
    expect((await a.review(f._id, { reviewStatus: "reviewed" })).body.feedback.statusHistory).toHaveLength(1);
    expect((await a.review(f._id, { reviewStatus: "new" })).body.feedback.statusHistory).toHaveLength(2);

    for (const body of [{}, { reviewStatus: "done" }, { reviewStatus: { $ne: null } }]) {
      expect((await a.review(f._id, body)).status).toBe(400);
    }
  });

  it("isn't changed by opening the detail page", async () => {
    const a = await owner("a");
    const f = await seed(a, { category: "complaint" });
    await a.get(f._id);
    await a.get(f._id);
    expect(await Feedback.findById(f._id)).toMatchObject({ reviewStatus: "new", complaintStatus: "open" });
  });
});

describe("complaint status", () => {
  it("moves through in progress, resolved and reopen with history and actor", async () => {
    const a = await owner("a");
    const f = await seed(a, { category: "complaint" });

    expect((await a.complaint(f._id, { status: "in_progress" })).body.feedback.complaintStatus).toBe("in_progress");

    const resolved = await a.complaint(f._id, { status: "resolved", resolutionSummary: "  Refunded the meal  " });
    expect(resolved.status).toBe(200);
    expect(resolved.body.feedback).toMatchObject({ complaintStatus: "resolved", resolutionSummary: "Refunded the meal" });
    expect(resolved.body.feedback.resolvedAt).toBeTruthy();

    const reopened = await a.complaint(f._id, { status: "reopen" });
    expect(reopened.body.feedback).toMatchObject({ complaintStatus: "open", resolutionSummary: "", resolvedAt: null });

    const history = reopened.body.feedback.statusHistory;
    expect(history.map((h) => [h.from, h.to])).toEqual([
      ["open", "in_progress"],
      ["in_progress", "resolved"],
      ["resolved", "open"],
    ]);
    expect(history[1].resolutionSummary).toBe("Refunded the meal");
    for (const entry of history) {
      expect(entry.by).toEqual({ id: a.userId, name: "Owner a" });
      expect(new Date(entry.at).getTime()).toBeGreaterThan(Date.now() - 60_000);
    }
    const stored = await Feedback.findById(f._id);
    expect(stored.statusHistory.every((h) => String(h.by) === a.userId)).toBe(true);
  });

  it.each([
    [{ status: "resolved" }],
    [{ status: "resolved", resolutionSummary: "" }],
    [{ status: "resolved", resolutionSummary: "    " }],
    [{ status: "resolved", resolutionSummary: "x".repeat(1001) }],
    [{ status: "resolved", resolutionSummary: { $gt: "" } }],
    [{ status: "closed" }],
    [{ status: { $in: ["resolved"] } }],
    [{}],
  ])("rejects %j", async (body) => {
    const a = await owner("a");
    const f = await seed(a, { category: "complaint" });
    const res = await a.complaint(f._id, body);
    expect(res.status).toBe(400);
    expect(await Feedback.findById(f._id)).toMatchObject({ complaintStatus: "open", resolutionSummary: "" });
  });

  it("accepts a 1000-character summary", async () => {
    const a = await owner("a");
    const f = await seed(a, { category: "complaint" });
    expect((await a.complaint(f._id, { status: "resolved", resolutionSummary: "x".repeat(1000) })).status).toBe(200);
  });

  it("refuses changes that make no sense", async () => {
    const a = await owner("a");
    const f = await seed(a, { category: "complaint" });

    expect((await a.complaint(f._id, { status: "open" })).body.error.code).toBe("INVALID_TRANSITION");
    expect((await a.complaint(f._id, { status: "reopen" })).status).toBe(409);
    await a.complaint(f._id, { status: "resolved", resolutionSummary: "Done" });
    expect((await a.complaint(f._id, { status: "in_progress" })).status).toBe(409);
    expect((await a.complaint(f._id, { status: "resolved", resolutionSummary: "Again" })).status).toBe(409);
    expect((await Feedback.findById(f._id)).statusHistory).toHaveLength(1);
  });

  it("gives non-complaints no complaint status", async () => {
    const a = await owner("a");
    for (const category of ["general", "suggestion", "compliment", "other"]) {
      const f = await seed(a, { category });
      const res = await a.complaint(f._id, { status: "in_progress" });
      expect(res.status, category).toBe(409);
      expect(res.body.error.code).toBe("NOT_A_COMPLAINT");
      const stored = await Feedback.findById(f._id);
      expect(stored.complaintStatus).toBeNull();
      expect(stored.statusHistory).toHaveLength(0);
    }
    expect((await a.list("complaintStatus=open")).body.total).toBe(0);
  });
});

describe("internal notes", () => {
  it("adds notes with author and time, and validates them", async () => {
    const a = await owner("a");
    const f = await seed(a);

    const res = await a.note(f._id, { text: "  Called the guest back  ", authorId: "000000000000000000000000" });
    expect(res.status).toBe(201);
    const [note] = res.body.feedback.internalNotes;
    expect(note).toMatchObject({ text: "Called the guest back", author: { id: a.userId, name: "Owner a" } });
    expect(new Date(note.createdAt).getTime()).toBeGreaterThan(Date.now() - 60_000);

    expect((await a.note(f._id, { text: "x".repeat(1000) })).status).toBe(201);
    for (const body of [{}, { text: "" }, { text: "   " }, { text: "x".repeat(1001) }, { text: { $gt: "" } }]) {
      expect((await a.note(f._id, body)).status).toBe(400);
    }
    expect((await a.get(f._id)).body.feedback.internalNotes).toHaveLength(2);
  });
});

describe("GET /api/feedback/summary", () => {
  it("returns real counts, a 30-day volume, and per-category and per-link counts", async () => {
    const a = await owner("a");
    const patio = await FeedbackLink.create({ businessId: a.business.id, organizationId: a.orgId, name: "Patio", code: "patio002" });
    await FeedbackLink.create({ businessId: a.business.id, organizationId: a.orgId, name: "Unused", code: "unused01" });
    const now = Date.now();
    await seed(a, { category: "complaint" });
    await seed(a, { category: "complaint", complaintStatus: "in_progress", reviewStatus: "reviewed" });
    await seed(a, { category: "complaint", complaintStatus: "resolved", reviewStatus: "reviewed", linkId: patio._id });
    await seed(a, { category: "compliment", linkId: patio._id, submittedAt: new Date(now - 3 * DAY) });
    await seed(a, { category: "suggestion", submittedAt: new Date(now - 45 * DAY) });

    const res = await a.summary("tz=UTC");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 5, new: 3, openComplaints: 1, inProgress: 1, resolved: 1 });

    expect(res.body.volume).toHaveLength(30);
    const today = new Date(now).toISOString().slice(0, 10);
    const threeDaysAgo = new Date(now - 3 * DAY).toISOString().slice(0, 10);
    expect(res.body.volume.at(-1)).toEqual({ date: today, count: 3 });
    expect(res.body.volume.find((d) => d.date === threeDaysAgo).count).toBe(1);
    expect(res.body.volume.reduce((sum, d) => sum + d.count, 0)).toBe(4); // the 45-day-old one is outside

    expect(res.body.byCategory).toEqual([
      { category: "general", count: 0 },
      { category: "complaint", count: 3 },
      { category: "suggestion", count: 1 },
      { category: "compliment", count: 1 },
      { category: "other", count: 0 },
    ]);
    expect(res.body.byLink.map((l) => [l.name, l.count])).toEqual([
      ["Main link", 3],
      ["Patio", 2],
      ["Unused", 0],
    ]);
  });

  it("returns zeros for a business with no feedback, and validates the time zone", async () => {
    const a = await owner("a");
    const res = await a.summary("tz=Asia/Kolkata");
    expect(res.body).toMatchObject({ total: 0, new: 0, openComplaints: 0, inProgress: 0, resolved: 0, timeZone: "Asia/Kolkata" });
    expect(res.body.volume.every((d) => d.count === 0)).toBe(true);
    expect((await a.summary("tz=Mars/Olympus")).status).toBe(400);
  });
});

describe("public routes never expose notes or status data", () => {
  it("public page and submit responses contain no inbox data", async () => {
    const a = await owner("a");
    const res = await request(app)
      .post(`/api/public/f/${a.business.publicSlug}/submit`)
      .send({ category: "complaint", message: "Cold food", idempotencyKey: crypto.randomUUID() });
    const f = await Feedback.findOne();
    await a.note(f._id, { text: "SECRET-NOTE-TEXT" });
    await a.complaint(f._id, { status: "resolved", resolutionSummary: "SECRET-RESOLUTION" });

    const repeat = await request(app)
      .post(`/api/public/f/${a.business.publicSlug}/submit`)
      .send({ category: "complaint", message: "Cold food", idempotencyKey: (await Feedback.findOne()).idempotencyKey });
    const responses = [
      res,
      repeat,
      await request(app).get(`/api/public/f/${a.business.publicSlug}`),
      await request(app).get(`/api/public/f/${a.business.publicSlug}/${a.mainLink.code}`),
      await request(app).get(`/api/public/business/${a.business.publicSlug}`),
    ];
    for (const r of responses) {
      const text = JSON.stringify(r.body);
      expect(text).not.toMatch(/SECRET|internalNotes|statusHistory|complaintStatus|reviewStatus|resolution|Cold food/);
    }
  });
});
