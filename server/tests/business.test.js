import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Organization } from "../src/models/Organization.js";
import { Business } from "../src/models/Business.js";
import { SESSION_COOKIE, signSession } from "../src/utils/session.js";

const app = createApp({ limits: { api: 10000, login: 1000, register: 1000, public: 1000 } });

const DAY = 24 * 60 * 60 * 1000;
const PASSWORD = "correct-horse-battery";

async function owner(email, { access = "active" } = {}) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: "Owner", email, password: PASSWORD, organizationName: `${email} org` });
  expect(res.status).toBe(201);
  const orgId = res.body.organization.id;
  if (access !== "pending") await Organization.updateOne({ _id: orgId }, { accessStatus: access });
  const cookie = res.headers["set-cookie"].find((c) => c.startsWith(`${SESSION_COOKIE}=`)).split(";")[0];

  const as = {
    get: (path = "") => request(app).get(`/api/business${path}`).set("Cookie", cookie),
    post: (body, path = "") => request(app).post(`/api/business${path}`).set("Cookie", cookie).send(body),
    patch: (body, path = "") => request(app).patch(`/api/business${path}`).set("Cookie", cookie).send(body),
  };
  return { cookie, orgId, ...as };
}

const getPublic = (slug) => request(app).get(`/api/public/business/${slug}`);

describe("access to /api/business", () => {
  it("requires a session", async () => {
    expect((await request(app).get("/api/business")).status).toBe(401);
    expect((await request(app).post("/api/business").send({ name: "X Cafe" })).status).toBe(401);
  });

  it.each([
    ["pending", "ACCESS_PENDING"],
    ["suspended", "ACCESS_SUSPENDED"],
    ["rejected", "ACCESS_REJECTED"],
  ])("blocks a %s owner from every route", async (access, code) => {
    const o = await owner("a@a.test", { access });
    for (const res of [await o.get(), await o.post({ name: "Corner Cafe" }), await o.patch({ name: "New" })]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(code);
    }
    expect(await Business.countDocuments()).toBe(0);
  });

  it("blocks an owner whose access period has ended", async () => {
    const o = await owner("a@a.test");
    await Organization.updateOne({ _id: o.orgId }, { accessExpiresAt: new Date(Date.now() - DAY) });
    const res = await o.post({ name: "Corner Cafe" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCESS_EXPIRED");
  });

  it("refuses the Super Admin", async () => {
    const admin = await User.create({
      name: "Ops",
      email: "ops@voiceloop.test",
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role: "superadmin",
    });
    const cookie = `${SESSION_COOKIE}=${signSession(admin._id)}`;
    const otherOrg = await Organization.create({ name: "Target", accessStatus: "active" });

    const create = await request(app)
      .post("/api/business")
      .set("Cookie", cookie)
      .send({ name: "Admin Cafe", organizationId: String(otherOrg._id) });
    expect(create.status).toBe(403);
    expect((await request(app).get("/api/business").set("Cookie", cookie)).status).toBe(403);
    expect((await request(app).patch("/api/business").set("Cookie", cookie).send({ name: "X" })).status).toBe(403);
    expect(await Business.countDocuments()).toBe(0);
  });
});

describe("creating a business", () => {
  it("creates the caller's business, and GET returns it (null before)", async () => {
    const o = await owner("a@a.test");
    expect((await o.get()).body).toEqual({ business: null });

    const res = await o.post({
      name: "  Corner Cafe ",
      locationName: "MG Road",
      welcomeMessage: "Tell us how we did!",
      googleReviewUrl: "https://g.page/r/abc123/review",
    });
    expect(res.status).toBe(201);
    expect(res.body.business).toMatchObject({
      name: "Corner Cafe",
      locationName: "MG Road",
      welcomeMessage: "Tell us how we did!",
      googleReviewUrl: "https://g.page/r/abc123/review",
      logoUrl: "",
      publicSlug: "corner-cafe",
      isActive: true,
    });
    expect(res.body.business).not.toHaveProperty("organizationId");

    const stored = await Business.findOne();
    expect(String(stored.organizationId)).toBe(o.orgId);
    expect((await o.get()).body.business.id).toBe(res.body.business.id);
  });

  it("refuses a second business for the same organization", async () => {
    const o = await owner("a@a.test");
    expect((await o.post({ name: "Corner Cafe" })).status).toBe(201);

    const second = await o.post({ name: "Second Shop" });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("BUSINESS_EXISTS");
    expect(await Business.countDocuments()).toBe(1);
  });

  it("ignores unknown fields such as organizationId, publicSlug, isActive and logoUrl", async () => {
    const a = await owner("a@a.test");
    const b = await owner("b@b.test");

    const res = await a.post({
      name: "Corner Cafe",
      organizationId: b.orgId,
      publicSlug: "chosen-slug",
      isActive: false,
      logoUrl: "https://evil.example/logo.png",
      _id: "64b000000000000000000000",
    });
    expect(res.status).toBe(201);
    expect(res.body.business).toMatchObject({ publicSlug: "corner-cafe", isActive: true, logoUrl: "" });
    expect(res.body.business.id).not.toBe("64b000000000000000000000");
    expect(String((await Business.findOne()).organizationId)).toBe(a.orgId);
    expect((await b.get()).body.business).toBeNull();
  });

  it.each([
    [{ name: "A" }, "name"],
    [{ name: "x".repeat(81) }, "name"],
    [{ name: "   " }, "name"],
    [{ name: 42 }, "name"],
    [{}, "name"],
    [{ name: "Cafe", locationName: "x".repeat(81) }, "locationName"],
    [{ name: "Cafe", welcomeMessage: "x".repeat(301) }, "welcomeMessage"],
    [{ name: "Cafe", googleReviewUrl: "http://g.page/r/abc" }, "googleReviewUrl"],
    [{ name: "Cafe", googleReviewUrl: "javascript:alert(1)" }, "googleReviewUrl"],
    [{ name: "Cafe", googleReviewUrl: "g.page/r/abc" }, "googleReviewUrl"],
    [{ name: "Cafe", googleReviewUrl: { $ne: "" } }, "googleReviewUrl"],
  ])("rejects invalid input %j", async (body, field) => {
    const o = await owner("a@a.test");
    const res = await o.post(body);
    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveProperty(field);
    expect(await Business.countDocuments()).toBe(0);
  });

  it("accepts boundary values and stores text exactly as entered", async () => {
    const o = await owner("a@a.test");
    const res = await o.post({
      name: `<b>Bob's</b> "Café"`,
      welcomeMessage: "x".repeat(300),
      locationName: "y".repeat(80),
      googleReviewUrl: "",
    });
    expect(res.status).toBe(201);
    expect(res.body.business.name).toBe(`<b>Bob's</b> "Café"`);
    expect((await Business.findOne()).name).toBe(`<b>Bob's</b> "Café"`);
  });
});

describe("public slugs", () => {
  it("makes a readable slug and adds a random suffix for duplicate names", async () => {
    const a = await owner("a@a.test");
    const b = await owner("b@b.test");
    const c = await owner("c@c.test");

    expect((await a.post({ name: "Corner Café & Co." })).body.business.publicSlug).toBe("corner-cafe-co");
    const second = (await b.post({ name: "Corner Cafe & Co" })).body.business.publicSlug;
    const third = (await c.post({ name: "corner café, co!" })).body.business.publicSlug;

    expect(second).toMatch(/^corner-cafe-co-[a-z0-9]{5}$/);
    expect(third).toMatch(/^corner-cafe-co-[a-z0-9]{5}$/);
    expect(new Set(["corner-cafe-co", second, third]).size).toBe(3);
  });

  it("falls back to a generic slug when the name has no Latin letters or digits", async () => {
    const o = await owner("a@a.test");
    expect((await o.post({ name: "चाय घर" })).body.business.publicSlug).toBe("business");
  });

  it("keeps the slug when the business is renamed", async () => {
    const o = await owner("a@a.test");
    await o.post({ name: "Corner Cafe" });

    const res = await o.patch({ name: "Harbor Bistro", publicSlug: "harbor-bistro" });
    expect(res.status).toBe(200);
    expect(res.body.business).toMatchObject({ name: "Harbor Bistro", publicSlug: "corner-cafe" });
    expect((await Business.findOne()).publicSlug).toBe("corner-cafe");
  });
});

describe("updating a business", () => {
  it("updates only the given fields and can clear optional ones", async () => {
    const o = await owner("a@a.test");
    await o.post({ name: "Corner Cafe", locationName: "MG Road", googleReviewUrl: "https://g.page/r/abc" });

    const res = await o.patch({ welcomeMessage: "Hi there", googleReviewUrl: "" });
    expect(res.status).toBe(200);
    expect(res.body.business).toMatchObject({
      name: "Corner Cafe",
      locationName: "MG Road",
      welcomeMessage: "Hi there",
      googleReviewUrl: "",
    });
  });

  it("validates updates and refuses empty ones", async () => {
    const o = await owner("a@a.test");
    await o.post({ name: "Corner Cafe" });

    expect((await o.patch({ name: "" })).status).toBe(400);
    expect((await o.patch({ googleReviewUrl: "ftp://x.test" })).status).toBe(400);
    expect((await o.patch({ isActive: false })).status).toBe(400); // no known fields
    expect((await o.patch({})).status).toBe(400);
    expect((await Business.findOne()).isActive).toBe(true);
  });

  it("returns 404 when the owner has no business yet", async () => {
    const o = await owner("a@a.test");
    const res = await o.patch({ name: "Corner Cafe" });
    expect(res.status).toBe(404);
  });
});

describe("tenant isolation", () => {
  async function twoBusinesses() {
    const a = await owner("a@a.test");
    const b = await owner("b@b.test");
    const aBiz = (await a.post({ name: "Alpha Cafe" })).body.business;
    const bBiz = (await b.post({ name: "Beta Salon", welcomeMessage: "B only" })).body.business;
    return { a, b, aBiz, bBiz };
  }

  it("each owner only ever sees their own business", async () => {
    const { a, b, aBiz, bBiz } = await twoBusinesses();
    expect((await a.get()).body.business.id).toBe(aBiz.id);
    expect((await b.get()).body.business.id).toBe(bBiz.id);

    // Owner B's ids in the query string change nothing.
    const withQuery = await a.get(`?organizationId=${b.orgId}&id=${bBiz.id}&publicSlug=${bBiz.publicSlug}`);
    expect(withQuery.body.business.id).toBe(aBiz.id);
  });

  it("owner A can't change owner B's business with B's ids in the body", async () => {
    const { a, aBiz, bBiz, b } = await twoBusinesses();

    const res = await a.patch({
      name: "Hacked",
      id: bBiz.id,
      _id: bBiz.id,
      businessId: bBiz.id,
      organizationId: b.orgId,
      publicSlug: bBiz.publicSlug,
    });
    expect(res.status).toBe(200);
    expect(res.body.business.id).toBe(aBiz.id);

    const bAfter = await Business.findById(bBiz.id);
    expect(bAfter.name).toBe("Beta Salon");
    expect(bAfter.welcomeMessage).toBe("B only");
    expect((await Business.findById(aBiz.id)).name).toBe("Hacked");
  });

  it("owner A can't reach owner B's business through ids in the URL", async () => {
    const { a, bBiz, b } = await twoBusinesses();

    for (const path of [`/${bBiz.id}`, `/${b.orgId}`, `/${bBiz.publicSlug}`]) {
      expect((await a.get(path)).status).toBe(404);
      expect((await a.patch({ name: "Hacked" }, path)).status).toBe(404);
    }
    expect((await Business.findById(bBiz.id)).name).toBe("Beta Salon");
  });

  it("an owner without a business doesn't see anyone else's, and creating one never touches another tenant", async () => {
    const a = await owner("a@a.test");
    await a.post({ name: "Alpha Cafe" });
    const c = await owner("c@c.test");

    expect((await c.get()).body.business).toBeNull();
    expect((await c.patch({ name: "Hacked" })).status).toBe(404);
    expect((await Business.findOne({ organizationId: a.orgId })).name).toBe("Alpha Cafe");
  });
});

describe("GET /api/public/business/:slug", () => {
  const PUBLIC_KEYS = [
    "feedbackCardButton",
    "feedbackCardText",
    "feedbackCardTitle",
    "googleReviewUrl",
    "locationName",
    "logoUrl",
    "name",
    "reviewCardButton",
    "reviewCardText",
    "reviewCardTitle",
    "slug",
    "welcomeMessage",
  ];

  async function publishedBusiness() {
    const o = await owner("a@a.test");
    const biz = (
      await o.post({
        name: "Corner Cafe",
        locationName: "MG Road",
        welcomeMessage: "Tell us how we did",
        googleReviewUrl: "https://g.page/r/abc/review",
      })
    ).body.business;
    return { o, biz };
  }

  it("returns only the public fields", async () => {
    const { biz, o } = await publishedBusiness();
    const res = await getPublic(biz.publicSlug);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(["business"]);
    expect(Object.keys(res.body.business).sort()).toEqual(PUBLIC_KEYS);
    expect(res.body.business).toEqual({
      slug: "corner-cafe",
      name: "Corner Cafe",
      locationName: "MG Road",
      welcomeMessage: "Tell us how we did",
      logoUrl: "",
      googleReviewUrl: "https://g.page/r/abc/review",
      reviewCardTitle: "",
      reviewCardText: "",
      reviewCardButton: "",
      feedbackCardTitle: "",
      feedbackCardText: "",
      feedbackCardButton: "",
    });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(o.orgId);
    expect(text).not.toContain(biz.id);
    expect(text).not.toMatch(/organization|owner|email|_id|password/i);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("needs no session", async () => {
    const { biz } = await publishedBusiness();
    expect((await request(app).get(`/api/public/business/${biz.publicSlug}`)).status).toBe(200);
  });

  it.each([
    ["suspended", { accessStatus: "suspended" }],
    ["expired (end date passed)", { accessExpiresAt: new Date(Date.now() - 1000) }],
    ["expired (status)", { accessStatus: "expired" }],
    ["pending again", { accessStatus: "pending" }],
    ["rejected", { accessStatus: "rejected" }],
  ])("returns a generic 404 when the organization is %s", async (label, update) => {
    const { biz, o } = await publishedBusiness();
    await Organization.updateOne({ _id: o.orgId }, update);

    const res = await getPublic(biz.publicSlug);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { message: "This feedback page isn't available", code: "NOT_FOUND" } });
  });

  it("returns the same 404 for an inactive business, an unknown slug, or a malformed one", async () => {
    const { biz } = await publishedBusiness();
    await Business.updateOne({ _id: biz.id }, { isActive: false });

    for (const slug of [biz.publicSlug, "no-such-place", "Corner_Cafe", "%24ne", "a".repeat(81)]) {
      const res = await getPublic(slug);
      expect(res.status, slug).toBe(404);
      expect(res.body.error.message).toBe("This feedback page isn't available");
    }
  });

  it("is rate limited", async () => {
    const { biz } = await publishedBusiness();
    const strictApp = createApp({ limits: { public: 2 } });
    expect((await request(strictApp).get(`/api/public/business/${biz.publicSlug}`)).status).toBe(200);
    expect((await request(strictApp).get(`/api/public/business/${biz.publicSlug}`)).status).toBe(200);
    const blocked = await request(strictApp).get(`/api/public/business/${biz.publicSlug}`);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
  });
});

describe("landing-screen wording", () => {
  const WORDING = {
    reviewCardTitle: "Tell others about your visit",
    reviewCardText: "Post a public review on Google.",
    reviewCardButton: "Review on Google",
    feedbackCardTitle: "Message the team",
    feedbackCardText: "Only the team reads this.",
    feedbackCardButton: "Write to us",
  };
  const LIMITS = { reviewCardTitle: 60, reviewCardText: 160, reviewCardButton: 30, feedbackCardTitle: 60, feedbackCardText: 160, feedbackCardButton: 30 };

  it("defaults to empty, saves on create and update (trimmed), and can be cleared", async () => {
    const a = await owner("a@a.test");
    const created = await a.post({ name: "Corner Cafe", reviewCardTitle: "  Share it  " });
    expect(created.status).toBe(201);
    expect(created.body.business).toMatchObject({ reviewCardTitle: "Share it", feedbackCardTitle: "", reviewCardText: "" });

    const updated = await a.patch(WORDING);
    expect(updated.status).toBe(200);
    expect(updated.body.business).toMatchObject(WORDING);

    const cleared = await a.patch({ reviewCardTitle: "", feedbackCardButton: "" });
    expect(cleared.body.business).toMatchObject({ ...WORDING, reviewCardTitle: "", feedbackCardButton: "" });
    expect(await Business.findOne()).toMatchObject({ reviewCardTitle: "", feedbackCardTitle: "Message the team" });
  });

  it("accepts each field at its limit and rejects one character more", async () => {
    const a = await owner("a@a.test");
    await a.post({ name: "Corner Cafe" });
    for (const [field, max] of Object.entries(LIMITS)) {
      expect((await a.patch({ [field]: "x".repeat(max) })).status, `${field} at ${max}`).toBe(200);
      const tooLong = await a.patch({ [field]: "y".repeat(max + 1) });
      expect(tooLong.status, `${field} at ${max + 1}`).toBe(400);
      expect(tooLong.body.error.details).toHaveProperty(field);
    }
    expect((await a.post({ name: "Second", feedbackCardText: "z".repeat(161) })).status).toBe(400);
  });

  it.each([[{ reviewCardTitle: { $ne: "" } }], [{ feedbackCardText: ["a", "b"] }], [{ reviewCardButton: 5 }], [{ feedbackCardTitle: null }]])(
    "rejects non-string values %j",
    async (body) => {
      const a = await owner("a@a.test");
      await a.post({ name: "Corner Cafe" });
      expect((await a.patch(body)).status).toBe(400);
      expect((await Business.findOne()).reviewCardTitle).toBe("");
    }
  );

  it("ignores unknown wording-like fields", async () => {
    const a = await owner("a@a.test");
    await a.post({ name: "Corner Cafe" });
    const res = await a.patch({ reviewCardTitle: "Hi there", reviewCardColor: "red", reviewIncentive: "10% off" });
    expect(res.status).toBe(200);
    expect(res.body.business).not.toHaveProperty("reviewCardColor");
    expect(res.body.business).not.toHaveProperty("reviewIncentive");
    const stored = (await Business.findOne()).toObject();
    expect(stored).not.toHaveProperty("reviewCardColor");
    expect(stored).not.toHaveProperty("reviewIncentive");
  });

  it("is returned by both public routes, with still no private fields", async () => {
    const a = await owner("a@a.test");
    const biz = (await a.post({ name: "Corner Cafe", googleReviewUrl: "https://g.page/r/x/review", ...WORDING })).body.business;

    for (const path of [`/api/public/business/${biz.publicSlug}`, `/api/public/f/${biz.publicSlug}`]) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(200);
      expect(res.body.business, path).toMatchObject(WORDING);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(a.orgId);
      expect(text).not.toContain(biz.id);
      expect(text).not.toMatch(/organization|owner|email|"_?id"|password|isActive|publicSlug/i);
    }
  });

  it("owner A can't change owner B's wording", async () => {
    const a = await owner("a@a.test");
    const b = await owner("b@b.test");
    await a.post({ name: "Alpha Cafe" });
    const bBiz = (await b.post({ name: "Beta Salon", reviewCardTitle: "B's own title" })).body.business;

    const res = await a.patch({ reviewCardTitle: "Hijacked", id: bBiz.id, _id: bBiz.id, organizationId: b.orgId });
    expect(res.status).toBe(200);
    expect(res.body.business.name).toBe("Alpha Cafe");
    expect((await Business.findById(bBiz.id)).reviewCardTitle).toBe("B's own title");
    expect((await a.patch({ reviewCardTitle: "Hijacked" }, `/${bBiz.id}`)).status).toBe(404);
    expect((await getPublic(bBiz.publicSlug)).body.business.reviewCardTitle).toBe("B's own title");
  });

  it("still returns the generic 404 for inactive or suspended businesses", async () => {
    const a = await owner("a@a.test");
    const biz = (await a.post({ name: "Corner Cafe", ...WORDING })).body.business;

    await Business.updateOne({ _id: biz.id }, { isActive: false });
    for (const path of [`/api/public/business/${biz.publicSlug}`, `/api/public/f/${biz.publicSlug}`]) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(404);
      expect(res.body).toEqual({ error: { message: "This feedback page isn't available", code: "NOT_FOUND" } });
    }

    await Business.updateOne({ _id: biz.id }, { isActive: true });
    await Organization.updateOne({ _id: a.orgId }, { accessStatus: "suspended" });
    for (const path of [`/api/public/business/${biz.publicSlug}`, `/api/public/f/${biz.publicSlug}`]) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain("Message the team");
    }
  });
});
