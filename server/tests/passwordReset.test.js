import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import request from "supertest";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { PasswordResetToken } from "../src/models/PasswordResetToken.js";
import { waitForPendingResets, RESETS_PER_ACCOUNT_PER_HOUR } from "../src/services/passwordReset.js";
import { getEmailSender, createEmailSender, EmailNotConfiguredError, EmailSendError } from "../src/services/email/index.js";
import { SESSION_COOKIE } from "../src/utils/session.js";

const LIMITS = { api: 10000, login: 1000, register: 1000, forgot: 1000, reset: 1000 };
const app = createApp({ limits: LIMITS });
const PASSWORD = "correct-horse-battery";
const NEW_PASSWORD = "a-brand-new-passphrase";
const GENERIC = { message: "If an account exists for that email, we sent a link to reset the password." };
const TOKEN_IN_LINK = /\/reset-password\?token=([A-Za-z0-9_-]{43})/;

let sent; // emails "sent" through the (spied) console provider

beforeEach(() => {
  sent = [];
  vi.spyOn(getEmailSender(), "send").mockImplementation(async (message) => {
    sent.push(message);
    return { id: null };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function register(email = "owner@shop.test") {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: "Owner", email, password: PASSWORD, organizationName: "Shop org" });
  expect(res.status).toBe(201);
  return { email, userId: res.body.user.id, cookie: res.headers["set-cookie"][0].split(";")[0] };
}

const forgot = (email, target = app) => request(target).post("/api/auth/forgot-password").send({ email });
const reset = (token, newPassword = NEW_PASSWORD, target = app) =>
  request(target).post("/api/auth/reset-password").send({ token, newPassword });
const login = (email, password) => request(app).post("/api/auth/login").send({ email, password });

// Requests a link and returns the token from the emailed URL.
async function requestToken(email) {
  const before = sent.length;
  expect((await forgot(email)).body).toEqual(GENERIC);
  await waitForPendingResets();
  expect(sent.length).toBe(before + 1);
  return sent.at(-1).text.match(TOKEN_IN_LINK)[1];
}

const expectInvalidLink = (res) => {
  expect(res.status).toBe(400);
  expect(res.body.error).toEqual({
    message: "This reset link is invalid or has expired. Request a new one.",
    code: "INVALID_RESET_TOKEN",
  });
};

describe("POST /api/auth/forgot-password", () => {
  it("answers the same for known and unknown emails, and emails only real accounts", async () => {
    const owner = await register();

    const known = await forgot("  OWNER@Shop.test ");
    const unknown = await forgot("nobody@shop.test");
    await waitForPendingResets();

    for (const res of [known, unknown]) {
      expect(res.status).toBe(200);
      expect(res.body).toEqual(GENERIC);
    }
    expect(Object.keys(known.headers).sort()).toEqual(Object.keys(unknown.headers).sort());

    expect(sent).toHaveLength(1);
    const [email] = sent;
    expect(email.to).toBe(owner.email);
    expect(email.subject).toBe("Reset your VoiceLoop password");
    const clientUrl = (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/+$/, "");
    expect(email.text).toContain(`${clientUrl}/reset-password?token=`);
    expect(email.html).toContain(`${clientUrl}/reset-password?token=`);
    expect(await PasswordResetToken.countDocuments()).toBe(1);
  });

  it("responds before the lookup and email have finished", async () => {
    await register();
    let release;
    getEmailSender().send.mockImplementation(() => new Promise((resolve) => (release = resolve)));

    const res = await forgot("owner@shop.test");
    expect(res.body).toEqual(GENERIC); // answered while sending is still pending
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    release({ id: null });
    await waitForPendingResets();
  });

  it("stores only a SHA-256 hash of a 32-byte token, valid for 30 minutes", async () => {
    const owner = await register();
    const started = Date.now();
    const token = await requestToken(owner.email);

    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    const [stored] = await PasswordResetToken.find().lean();
    expect(stored.tokenHash).toBe(crypto.createHash("sha256").update(token).digest("hex"));
    expect(String(stored.userId)).toBe(owner.userId);
    expect(stored.usedAt).toBeNull();
    expect(stored.expiresAt.getTime() - started).toBeGreaterThan(29 * 60 * 1000);
    expect(stored.expiresAt.getTime() - started).toBeLessThanOrEqual(30 * 60 * 1000 + 5000);

    // The token itself is nowhere in the database.
    const everything = [];
    for (const collection of await mongoose.connection.db.collections()) everything.push(await collection.find().toArray());
    expect(JSON.stringify(everything)).not.toContain(token);
  });

  it("has a TTL index that removes old tokens", async () => {
    const indexes = await PasswordResetToken.collection.indexes();
    expect(indexes.find((i) => i.key.expiresAt === 1)).toMatchObject({ expireAfterSeconds: 86400 });
  });

  it("retires older unused links when a new one is requested", async () => {
    const owner = await register();
    const first = await requestToken(owner.email);
    const second = await requestToken(owner.email);

    expectInvalidLink(await reset(first));
    expect((await reset(second)).status).toBe(200);
  });

  it("rejects invalid emails and operator objects", async () => {
    for (const email of [undefined, "", "not-an-email", { $ne: null }, ["a@b.test"]]) {
      const res = await forgot(email);
      expect(res.status, JSON.stringify(email)).toBe(400);
      expect(res.body.error.details).toHaveProperty("email");
    }
    await waitForPendingResets();
    expect(sent).toHaveLength(0);
  });

  it("is rate limited per IP, and to 3 links per account per hour", async () => {
    const owner = await register();
    const strict = createApp({ limits: { ...LIMITS, forgot: 2 } });
    expect((await forgot("x@shop.test", strict)).status).toBe(200);
    expect((await forgot("y@shop.test", strict)).status).toBe(200);
    const blocked = await forgot(owner.email, strict);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");

    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < RESETS_PER_ACCOUNT_PER_HOUR + 2; i++) {
      expect((await forgot(owner.email)).body).toEqual(GENERIC); // the answer never changes
      await waitForPendingResets();
    }
    expect(sent).toHaveLength(RESETS_PER_ACCOUNT_PER_HOUR);
    expect(await PasswordResetToken.countDocuments({ userId: owner.userId })).toBe(RESETS_PER_ACCOUNT_PER_HOUR);
  });
});

describe("POST /api/auth/reset-password", () => {
  it("sets the new password and works only once", async () => {
    const owner = await register();
    const token = await requestToken(owner.email);

    const res = await reset(token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Your password was changed. Log in with your new password." });

    expect((await login(owner.email, PASSWORD)).status).toBe(401);
    expect((await login(owner.email, NEW_PASSWORD)).status).toBe(200);
    const user = await User.findById(owner.userId).select("+passwordHash");
    expect(await bcrypt.compare(NEW_PASSWORD, user.passwordHash)).toBe(true);
    expect(user.passwordChangedAt).toBeInstanceOf(Date);
    expect((await PasswordResetToken.findOne().lean()).usedAt).toBeInstanceOf(Date);

    expectInvalidLink(await reset(token, "yet-another-passphrase"));
    expect((await login(owner.email, NEW_PASSWORD)).status).toBe(200);
  });

  it("can't be used twice even by two requests at once", async () => {
    const owner = await register();
    const token = await requestToken(owner.email);
    const results = await Promise.all([reset(token, "first-new-passphrase"), reset(token, "second-new-passphrase")]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });

  it("gives the same error for expired, unknown and malformed tokens", async () => {
    const owner = await register();
    const token = await requestToken(owner.email);
    await PasswordResetToken.updateOne({}, { expiresAt: new Date(Date.now() - 1000) });

    expectInvalidLink(await reset(token));
    expectInvalidLink(await reset(crypto.randomBytes(32).toString("base64url")));
    for (const bad of [undefined, "", "short", `${token}x`, { $ne: null }, [token], 42]) {
      expectInvalidLink(await reset(bad));
    }
    expect((await login(owner.email, PASSWORD)).status).toBe(200); // unchanged
  });

  it("ends every existing session", async () => {
    const owner = await register();
    expect((await request(app).get("/api/auth/me").set("Cookie", owner.cookie)).status).toBe(200);
    const otherDevice = (await login(owner.email, PASSWORD)).headers["set-cookie"][0].split(";")[0];

    expect((await reset(await requestToken(owner.email))).status).toBe(200);

    for (const cookie of [owner.cookie, otherDevice]) {
      const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
      expect(me.status).toBe(401);
      expect(me.body.error.code).toBe("SESSION_EXPIRED");
    }
    const fresh = (await login(owner.email, NEW_PASSWORD)).headers["set-cookie"][0].split(";")[0];
    expect((await request(app).get("/api/auth/me").set("Cookie", fresh)).status).toBe(200);
  });

  it("refuses weak or invalid passwords and leaves the link usable", async () => {
    const owner = await register();
    const token = await requestToken(owner.email);
    // Sent directly: the reset() helper would turn undefined into its default.
    for (const newPassword of [undefined, "", "short", "é".repeat(37), { $gt: "" }, ["a-long-enough-password"]]) {
      const res = await request(app).post("/api/auth/reset-password").send({ token, newPassword });
      expect(res.status, JSON.stringify(newPassword)).toBe(400);
      expect(res.body.error.details).toHaveProperty("newPassword");
    }
    expect((await PasswordResetToken.findOne().lean()).usedAt).toBeNull();
    expect((await reset(token)).status).toBe(200);
  });

  it("is rate limited per IP", async () => {
    const strict = createApp({ limits: { ...LIMITS, reset: 2 } });
    const token = crypto.randomBytes(32).toString("base64url");
    expect((await reset(token, NEW_PASSWORD, strict)).status).toBe(400);
    expect((await reset(token, NEW_PASSWORD, strict)).status).toBe(400);
    expect((await reset(token, NEW_PASSWORD, strict)).status).toBe(429);
  });

  it("works for the Super Admin too", async () => {
    await User.create({
      name: "Ops",
      email: "ops@voiceloop.test",
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role: "superadmin",
    });
    expect((await reset(await requestToken("ops@voiceloop.test"))).status).toBe(200);
    expect((await login("ops@voiceloop.test", NEW_PASSWORD)).status).toBe(200);
  });
});

describe("email providers", () => {
  it("in production, the console provider sends nothing and prints no link", async () => {
    vi.restoreAllMocks(); // use the real console provider
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const owner = await register();

    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect((await forgot(owner.email)).body).toEqual(GENERIC);
      await waitForPendingResets();
    } finally {
      process.env.NODE_ENV = previous;
    }

    expect(info).not.toHaveBeenCalled();
    const logged = error.mock.calls.flat().join(" ");
    expect(logged).toMatch(/console.*development only/);
    expect(logged).not.toMatch(/token=|reset-password/);
  });

  it("refuses to send through Resend without a key or sender, and never calls it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn();
    for (const env of [
      { NODE_ENV: "production", EMAIL_PROVIDER: "resend", EMAIL_FROM: "VoiceLoop <a@b.test>" },
      { NODE_ENV: "production", EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_test" },
    ]) {
      const sender = createEmailSender(env, { fetchImpl });
      await expect(sender.send({ to: "x@y.test", subject: "s", text: "t", html: "h" })).rejects.toBeInstanceOf(EmailNotConfiguredError);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(() => createEmailSender({ EMAIL_PROVIDER: "carrier-pigeon" })).toThrow(/Unknown EMAIL_PROVIDER/);
  });

  it("calls Resend's API correctly and reports errors without the key", async () => {
    const key = "re_secret_key_123";
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "email_1" }), { status: 200 }));
    const sender = createEmailSender({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: key, EMAIL_FROM: "VoiceLoop <no-reply@vl.test>" }, { fetchImpl });

    expect(await sender.send({ to: "x@y.test", subject: "Hi", text: "Plain", html: "<p>Hi</p>", idempotencyKey: "k1" })).toEqual({ id: "email_1" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": "k1" });
    expect(JSON.parse(init.body)).toEqual({ from: "VoiceLoop <no-reply@vl.test>", to: ["x@y.test"], subject: "Hi", text: "Plain", html: "<p>Hi</p>" });

    fetchImpl.mockImplementationOnce(
      async () => new Response(JSON.stringify({ name: "validation_error", message: "The vl.test domain is not verified." }), { status: 403 })
    );
    const failure = await sender.send({ to: "x@y.test", subject: "Hi", text: "Plain", html: "" }).catch((err) => err);
    expect(failure).toBeInstanceOf(EmailSendError);
    expect(failure.message).toBe("Resend responded 403 (validation_error: The vl.test domain is not verified.)");
    expect(failure.message).not.toContain(key);
  });
});
