import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import request from "supertest";
import bcrypt from "bcrypt";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Organization } from "../src/models/Organization.js";
import { Business } from "../src/models/Business.js";
import { FeedbackLink } from "../src/models/FeedbackLink.js";
import { Feedback } from "../src/models/Feedback.js";
import { ensureDefaultLink } from "../src/services/feedbackLinks.js";
import { SESSION_COOKIE, signSession } from "../src/utils/session.js";

const app = createApp({ limits: { api: 10000, login: 1000, register: 1000, public: 10000, submit: 10000 } });

const DAY = 24 * 60 * 60 * 1000;
const PASSWORD = "correct-horse-battery";
const key = () => crypto.randomUUID();

// An active owner with a business. `as.*` sends requests with their session.
async function ownerWithBusiness(email, businessName = `${email} shop`) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: "Owner", email, password: PASSWORD, organizationName: `${email} org` });
  const orgId = res.body.organization.id;
  await Organization.updateOne({ _id: orgId }, { accessStatus: "active" });
  const cookie = res.headers["set-cookie"].find((c) => c.startsWith(`${SESSION_COOKIE}=`)).split(";")[0];

  const created = await request(app).post("/api/business").set("Cookie", cookie).send({ name: businessName });
  expect(created.status).toBe(201);

  return {
    orgId,
    cookie,
    business: created.body.business,
    slug: created.body.business.publicSlug,
    links: {
      list: () => request(app).get("/api/links").set("Cookie", cookie),
      create: (body) => request(app).post("/api/links").set("Cookie", cookie).send(body),
      update: (id, body) => request(app).patch(`/api/links/${id}`).set("Cookie", cookie).send(body),
    },
  };
}

const getPage = (slug, code) => request(app).get(`/api/public/f/${slug}${code ? `/${code}` : ""}`);
const submit = (slug, body) =>
  request(app)
    .post(`/api/public/f/${slug}/submit`)
    .send({ category: "general", message: "Lovely coffee", idempotencyKey: key(), ...body });

function expectNoPrivateFields(res, owner) {
  const text = JSON.stringify(res.body);
  expect(text).not.toMatch(/"(id|_id|businessId|organizationId|linkId|internalNotes|reviewStatus|complaintStatus)"/);
  expect(text).not.toMatch(/owner|email|password|organization/i);
  if (owner) {
    expect(text).not.toContain(owner.orgId);
    expect(text).not.toContain(owner.business.id);
  }
}

describe("default link", () => {
  it("is created with every business", async () => {
    const o = await ownerWithBusiness("a@a.test");
    const res = await o.links.list();

    expect(res.status).toBe(200);
    expect(res.body.links).toHaveLength(1);
    expect(res.body.links[0]).toMatchObject({ name: "Main link", isDefault: true, isActive: true, feedbackCount: 0 });
    expect(res.body.links[0].code).toMatch(/^[a-z0-9]{8}$/);
  });

  it("is backfilled for an older business, exactly once even when created concurrently", async () => {
    const org = await Organization.create({ name: "Old org", accessStatus: "active" });
    const business = await Business.create({ organizationId: org._id, name: "Old Shop", publicSlug: "old-shop" });
    expect(await FeedbackLink.countDocuments()).toBe(0);

    const results = await Promise.all([1, 2, 3, 4, 5].map(() => ensureDefaultLink(business)));
    expect(new Set(results.map((l) => String(l._id))).size).toBe(1);
    expect(await FeedbackLink.countDocuments({ businessId: business._id, isDefault: true })).toBe(1);

    await ensureDefaultLink(business);
    expect(await FeedbackLink.countDocuments({ businessId: business._id })).toBe(1);
  });
});

describe("/api/links", () => {
  it("creates named links with generated codes, ignoring unknown fields", async () => {
    const a = await ownerWithBusiness("a@a.test");
    const b = await ownerWithBusiness("b@b.test");

    const res = await a.links.create({
      name: "  Table 4 ",
      code: "chosen01",
      isActive: false,
      isDefault: true,
      businessId: b.business.id,
      organizationId: b.orgId,
    });
    expect(res.status).toBe(201);
    expect(res.body.link).toMatchObject({ name: "Table 4", isActive: true, isDefault: false, feedbackCount: 0 });
    expect(res.body.link.code).not.toBe("chosen01");

    const stored = await FeedbackLink.findById(res.body.link.id);
    expect(String(stored.businessId)).toBe(a.business.id);
    expect(String(stored.organizationId)).toBe(a.orgId);
    expect((await b.links.list()).body.links).toHaveLength(1);
  });

  it.each([[{}], [{ name: "A" }], [{ name: "x".repeat(61) }], [{ name: { $gt: "" } }]])(
    "rejects an invalid link name %j",
    async (body) => {
      const o = await ownerWithBusiness("a@a.test");
      expect((await o.links.create(body)).status).toBe(400);
    }
  );

  it("renames and deactivates/reactivates a link", async () => {
    const o = await ownerWithBusiness("a@a.test");
    const { link } = (await o.links.create({ name: "Reception" })).body;

    const renamed = await o.links.update(link.id, { name: "Front desk", code: "zzzzzzzz" });
    expect(renamed.body.link).toMatchObject({ name: "Front desk", code: link.code });

    expect((await o.links.update(link.id, { isActive: false })).body.link.isActive).toBe(false);
    expect((await o.links.update(link.id, { isActive: true })).body.link.isActive).toBe(true);

    expect((await o.links.update(link.id, { isActive: "no" })).status).toBe(400);
    expect((await o.links.update(link.id, {})).status).toBe(400);
    expect((await o.links.update("not-an-id", { name: "Xx" })).status).toBe(404);
  });

  it("lists links with a feedback count for each", async () => {
    const o = await ownerWithBusiness("a@a.test");
    const { link: table } = (await o.links.create({ name: "Table 4" })).body;

    await submit(o.slug, {});
    await submit(o.slug, { linkCode: table.code });
    await submit(o.slug, { linkCode: table.code });

    const { links } = (await o.links.list()).body;
    expect(links.map((l) => [l.name, l.feedbackCount])).toEqual([
      ["Main link", 1],
      ["Table 4", 2],
    ]);
  });

  it("keeps a link's feedback when it is deactivated, and stops new submissions through it", async () => {
    const o = await ownerWithBusiness("a@a.test");
    const { link } = (await o.links.create({ name: "Patio" })).body;
    await submit(o.slug, { linkCode: link.code });
    await submit(o.slug, { linkCode: link.code });

    const res = await o.links.update(link.id, { isActive: false });
    expect(res.body.link.feedbackCount).toBe(2);
    expect(await Feedback.countDocuments({ linkId: link.id })).toBe(2);
    expect((await o.links.list()).body.links.find((l) => l.id === link.id).feedbackCount).toBe(2);

    expect((await submit(o.slug, { linkCode: link.code })).status).toBe(404);
    expect(await Feedback.countDocuments({ linkId: link.id })).toBe(2);
  });

  it("owner A can't list or edit owner B's links", async () => {
    const a = await ownerWithBusiness("a@a.test");
    const b = await ownerWithBusiness("b@b.test");
    const { link: bLink } = (await b.links.create({ name: "B Bar" })).body;

    const aList = (await a.links.list()).body.links;
    expect(aList.map((l) => l.name)).toEqual(["Main link"]);
    expect(aList.some((l) => l.id === bLink.id)).toBe(false);

    const edit = await a.links.update(bLink.id, { name: "Hijacked", isActive: false });
    expect(edit.status).toBe(404);
    const after = await FeedbackLink.findById(bLink.id);
    expect(after).toMatchObject({ name: "B Bar", isActive: true });

    // Query-string ids are ignored too.
    const withQuery = await request(app).get(`/api/links?businessId=${b.business.id}`).set("Cookie", a.cookie);
    expect(withQuery.body.links.map((l) => l.name)).toEqual(["Main link"]);
  });

  it("refuses pending and suspended owners, owners without a business, and the Super Admin", async () => {
    const pending = await request(app)
      .post("/api/auth/register")
      .send({ name: "P", email: "p@p.test", password: PASSWORD, organizationName: "P org" });
    const pendingCookie = pending.headers["set-cookie"][0].split(";")[0];
    expect((await request(app).get("/api/links").set("Cookie", pendingCookie)).status).toBe(403);

    const s = await ownerWithBusiness("s@s.test");
    await Organization.updateOne({ _id: s.orgId }, { accessStatus: "suspended" });
    const suspended = await s.links.list();
    expect(suspended.status).toBe(403);
    expect(suspended.body.error.code).toBe("ACCESS_SUSPENDED");
    expect((await s.links.create({ name: "New one" })).status).toBe(403);

    await Organization.updateOne({ _id: pending.body.organization.id }, { accessStatus: "active" });
    const noBusiness = await request(app).get("/api/links").set("Cookie", pendingCookie);
    expect(noBusiness.status).toBe(404);
    expect(noBusiness.body.error.code).toBe("NO_BUSINESS");

    const admin = await User.create({
      name: "Ops",
      email: "ops@voiceloop.test",
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role: "superadmin",
    });
    const adminCookie = `${SESSION_COOKIE}=${signSession(admin._id)}`;
    expect((await request(app).get("/api/links").set("Cookie", adminCookie)).status).toBe(403);
    expect((await request(app).post("/api/links").set("Cookie", adminCookie).send({ name: "Admin" })).status).toBe(403);
  });
});

describe("GET /api/public/f/:slug/:code?", () => {
  it("returns only public business fields, with or without a link code", async () => {
    const o = await ownerWithBusiness("a@a.test", "Corner Cafe");
    const { link } = (await o.links.create({ name: "Table 4" })).body;

    const plain = await getPage(o.slug);
    expect(plain.status).toBe(200);
    expect(plain.body).toEqual({
      business: {
        slug: "corner-cafe",
        name: "Corner Cafe",
        locationName: "",
        welcomeMessage: "",
        logoUrl: "",
        googleReviewUrl: "",
        reviewCardTitle: "",
        reviewCardText: "",
        reviewCardButton: "",
        feedbackCardTitle: "",
        feedbackCardText: "",
        feedbackCardButton: "",
      },
      linkCode: null,
    });
    expectNoPrivateFields(plain, o);

    const withCode = await getPage(o.slug, link.code);
    expect(withCode.status).toBe(200);
    expect(withCode.body.linkCode).toBe(link.code);
    expect(JSON.stringify(withCode.body)).not.toContain("Table 4"); // the owner's link names stay private
    expectNoPrivateFields(withCode, o);
  });

  it("returns the same generic 404 for every unavailable case", async () => {
    const o = await ownerWithBusiness("a@a.test");
    const other = await ownerWithBusiness("b@b.test");
    const { link } = (await o.links.create({ name: "Patio" })).body;
    await o.links.update(link.id, { isActive: false });
    const otherDefault = (await other.links.list()).body.links[0];

    const cases = [
      ["unknown slug", () => getPage("no-such-shop")],
      ["unknown code", () => getPage(o.slug, "zzzzzzzz")],
      ["malformed code", () => getPage(o.slug, "NOT_A_CODE")],
      ["inactive link", () => getPage(o.slug, link.code)],
      ["another business's link", () => getPage(o.slug, otherDefault.code)],
    ];
    for (const [label, call] of cases) {
      const res = await call();
      expect(res.status, label).toBe(404);
      expect(res.body, label).toEqual({ error: { message: "This feedback page isn't available", code: "NOT_FOUND" } });
    }
  });

  it.each([
    ["suspended", { accessStatus: "suspended" }],
    ["expired", { accessExpiresAt: new Date(Date.now() - DAY) }],
    ["pending", { accessStatus: "pending" }],
  ])("returns 404 when the account is %s", async (label, update) => {
    const o = await ownerWithBusiness("a@a.test");
    await Organization.updateOne({ _id: o.orgId }, update);
    expect((await getPage(o.slug)).status).toBe(404);
  });

  it("returns 404 for /f/<slug> when the default link is deactivated", async () => {
    const o = await ownerWithBusiness("a@a.test");
    const main = (await o.links.list()).body.links[0];
    await o.links.update(main.id, { isActive: false });
    expect((await getPage(o.slug)).status).toBe(404);
  });
});

describe("POST /api/public/f/:slug/submit", () => {
  it("stores feedback in the right business and link and confirms after saving", async () => {
    const a = await ownerWithBusiness("a@a.test");
    const b = await ownerWithBusiness("b@b.test");
    const { link } = (await b.links.create({ name: "Table 4" })).body;

    const res = await submit(b.slug, {
      category: "suggestion",
      message: "  More vegan options please  ",
      customerName: " Priya ",
      customerEmail: " Priya@Example.com ",
      linkCode: link.code,
    });
    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(["submitted", "submittedAt"]);
    expect(res.body.submitted).toBe(true);
    expectNoPrivateFields(res, b);

    const stored = await Feedback.findOne();
    expect(String(stored.businessId)).toBe(b.business.id);
    expect(String(stored.organizationId)).toBe(b.orgId);
    expect(String(stored.linkId)).toBe(link.id);
    expect(stored).toMatchObject({
      category: "suggestion",
      message: "More vegan options please",
      customerName: "Priya",
      customerEmail: "priya@example.com",
      submissionType: "text",
      reviewStatus: "new",
      complaintStatus: null,
    });
    expect(stored.internalNotes).toHaveLength(0);
    expect(stored.submittedAt.toISOString()).toBe(res.body.submittedAt);
    expect(await Feedback.countDocuments({ businessId: a.business.id })).toBe(0);
  });

  it("attributes feedback without a link code to the default link, and is anonymous by default", async () => {
    const o = await ownerWithBusiness("a@a.test");
    const main = (await o.links.list()).body.links[0];

    expect((await submit(o.slug, { message: "Nice" })).status).toBe(201);
    const stored = await Feedback.findOne();
    expect(String(stored.linkId)).toBe(main.id);
    expect(stored).toMatchObject({ customerName: "", customerEmail: "" });
  });

  it("opens complaints, and only complaints", async () => {
    const o = await ownerWithBusiness("a@a.test");
    for (const category of ["general", "complaint", "suggestion", "compliment", "other"]) {
      expect((await submit(o.slug, { category, message: `About ${category}` })).status).toBe(201);
    }
    const byCategory = Object.fromEntries((await Feedback.find()).map((f) => [f.category, f.complaintStatus]));
    expect(byCategory).toEqual({ general: null, complaint: "open", suggestion: null, compliment: null, other: null });
  });

  it("stores one record for a repeated idempotency key and answers the same way", async () => {
    const o = await ownerWithBusiness("a@a.test");
    const idempotencyKey = key();
    const body = { category: "complaint", message: "Cold food", idempotencyKey };

    const first = await submit(o.slug, body);
    const again = await submit(o.slug, body);
    const concurrent = await Promise.all([submit(o.slug, body), submit(o.slug, body)]);

    for (const res of [again, ...concurrent]) {
      expect(res.status).toBe(first.status);
      expect(res.body).toEqual(first.body);
    }
    expect(await Feedback.countDocuments()).toBe(1);
  });

  it("allows the same idempotency key at a different business", async () => {
    const a = await ownerWithBusiness("a@a.test");
    const b = await ownerWithBusiness("b@b.test");
    const idempotencyKey = key();
    await submit(a.slug, { idempotencyKey });
    await submit(b.slug, { idempotencyKey });
    expect(await Feedback.countDocuments()).toBe(2);
  });

  it("ignores status, notes, ids and other unknown fields in the body", async () => {
    const a = await ownerWithBusiness("a@a.test");
    const b = await ownerWithBusiness("b@b.test");

    const res = await submit(a.slug, {
      category: "complaint",
      reviewStatus: "reviewed",
      complaintStatus: "resolved",
      internalNotes: [{ text: "planted" }],
      submissionType: "voice",
      businessId: b.business.id,
      organizationId: b.orgId,
      submittedAt: "2001-01-01T00:00:00.000Z",
    });
    expect(res.status).toBe(201);
    const stored = await Feedback.findOne();
    expect(String(stored.businessId)).toBe(a.business.id);
    expect(stored).toMatchObject({ reviewStatus: "new", complaintStatus: "open", submissionType: "text" });
    expect(stored.internalNotes).toHaveLength(0);
    expect(stored.submittedAt.getFullYear()).toBeGreaterThan(2020);
  });

  it.each([
    ["invalid category", { category: "spam" }, "category"],
    ["category as object", { category: { $ne: null } }, "category"],
    ["empty message", { message: "" }, "message"],
    ["blank message", { message: "    " }, "message"],
    ["oversized message", { message: "x".repeat(2001) }, "message"],
    ["message as object", { message: { $gt: "" } }, "message"],
    ["bad email", { customerEmail: "not-an-email" }, "customerEmail"],
    ["email as object", { customerEmail: { $regex: ".*" } }, "customerEmail"],
    ["name too long", { customerName: "x".repeat(81) }, "customerName"],
    ["link code as object", { linkCode: { $ne: "" } }, "linkCode"],
    ["missing idempotency key", { idempotencyKey: undefined }, "idempotencyKey"],
    ["short idempotency key", { idempotencyKey: "abc" }, "idempotencyKey"],
  ])("rejects %s", async (label, override, field) => {
    const o = await ownerWithBusiness("a@a.test");
    const res = await submit(o.slug, override);
    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveProperty(field);
    expect(await Feedback.countDocuments()).toBe(0);
  });

  it("accepts a 2000-character message and stores markup as plain text", async () => {
    const o = await ownerWithBusiness("a@a.test");
    expect((await submit(o.slug, { message: "x".repeat(2000) })).status).toBe(201);
    expect((await submit(o.slug, { message: "<img src=x onerror=alert(1)>" })).status).toBe(201);
    expect(await Feedback.exists({ message: "<img src=x onerror=alert(1)>" })).toBeTruthy();
  });

  it("refuses unknown slugs, inactive or foreign links, and suspended or expired accounts with the generic 404", async () => {
    const o = await ownerWithBusiness("a@a.test");
    const other = await ownerWithBusiness("b@b.test");
    const { link } = (await o.links.create({ name: "Patio" })).body;
    await o.links.update(link.id, { isActive: false });
    const otherDefault = (await other.links.list()).body.links[0];

    const expectGeneric404 = (res, label) => {
      expect(res.status, label).toBe(404);
      expect(res.body.error.message, label).toBe("This feedback page isn't available");
    };
    expectGeneric404(await submit("no-such-shop", {}), "unknown slug");
    expectGeneric404(await submit(o.slug, { linkCode: link.code }), "inactive link");
    expectGeneric404(await submit(o.slug, { linkCode: "zzzzzzzz" }), "unknown code");
    expectGeneric404(await submit(o.slug, { linkCode: otherDefault.code }), "another business's link");

    await Organization.updateOne({ _id: o.orgId }, { accessStatus: "suspended" });
    expectGeneric404(await submit(o.slug, {}), "suspended");
    await Organization.updateOne({ _id: o.orgId }, { accessStatus: "active", accessExpiresAt: new Date(Date.now() - DAY) });
    expectGeneric404(await submit(o.slug, {}), "expired");

    expect(await Feedback.countDocuments()).toBe(0);
  });

  it("is rate limited more strictly than other public routes", async () => {
    const o = await ownerWithBusiness("a@a.test");
    const strictApp = createApp({ limits: { public: 100, submit: 2 } });
    const send = () =>
      request(strictApp)
        .post(`/api/public/f/${o.slug}/submit`)
        .send({ category: "general", message: "Hi", idempotencyKey: key() });

    expect((await send()).status).toBe(201);
    expect((await send()).status).toBe(201);
    const blocked = await send();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
    // Reading the page isn't affected by the submit limit.
    expect((await request(strictApp).get(`/api/public/f/${o.slug}`)).status).toBe(200);
    expect(await Feedback.countDocuments()).toBe(2);
  });
});
