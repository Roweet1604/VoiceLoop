import { describe, it, expect, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import path from "node:path";
import { readdir, readFile, rm } from "node:fs/promises";
import request from "supertest";
import bcrypt from "bcrypt";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Organization } from "../src/models/Organization.js";
import { Feedback } from "../src/models/Feedback.js";
import { getStorage, createStorage } from "../src/services/storage/index.js";
import { SESSION_COOKIE, signSession } from "../src/utils/session.js";

const app = createApp({ limits: { api: 10000, login: 1000, register: 1000, public: 10000, submit: 10000, voice: 10000 } });
const PASSWORD = "correct-horse-battery";
const key = () => crypto.randomUUID();

afterEach(() => {
  vi.restoreAllMocks();
});

// --- Fake recordings: just enough bytes to look like each format ------------------

function withHeader(header, size) {
  const buffer = Buffer.alloc(size, 0x11);
  Buffer.from(header).copy(buffer);
  return buffer;
}
const AUDIO = {
  webm: (size = 4000) => {
    const b = withHeader([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84], size);
    b.write("webm", 8, "latin1");
    return b;
  },
  ogg: (size = 4000) => withHeader(Buffer.from("OggS\0\x02", "latin1"), size),
  mp4: (size = 4000) => withHeader(Buffer.from("\0\0\0\x20ftypM4A \0\0\0\0", "latin1"), size),
  mpeg: (size = 4000) => withHeader(Buffer.from("ID3\x04\0\0", "latin1"), size),
  wav: (size = 4000) => {
    const b = withHeader(Buffer.from("RIFF\0\0\0\0WAVEfmt ", "latin1"), size);
    return b;
  },
};

// --- Helpers ---------------------------------------------------------------------

async function owner(label) {
  const reg = await request(app)
    .post("/api/auth/register")
    .send({ name: `Owner ${label}`, email: `${label}@${label}.test`, password: PASSWORD, organizationName: `Org ${label}` });
  const orgId = reg.body.organization.id;
  await Organization.updateOne({ _id: orgId }, { accessStatus: "active" });
  const cookie = reg.headers["set-cookie"].find((c) => c.startsWith(`${SESSION_COOKIE}=`)).split(";")[0];
  const business = (await request(app).post("/api/business").set("Cookie", cookie).send({ name: `Shop ${label}` })).body
    .business;
  return { label, orgId, cookie, business, slug: business.publicSlug };
}

// Sends a multipart voice submission. `file: null` sends no audio part.
function submitVoice(slug, { fields = {}, file = AUDIO.webm(), contentType = "audio/webm;codecs=opus", target = app } = {}) {
  const req = request(target).post(`/api/public/f/${slug}/submit-voice`);
  const all = { category: "general", durationSec: "12.4", idempotencyKey: key(), ...fields };
  for (const [name, value] of Object.entries(all)) {
    if (value !== undefined) req.field(name, value);
  }
  if (file) req.attach("audio", file, { filename: "recording", contentType });
  return req;
}

// Every file in local storage, as "<businessId>/<name>".
async function storedFiles() {
  const root = getStorage().root;
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => path.relative(root, path.join(e.parentPath, e.name)).split(path.sep).join("/"))
    .sort();
}

// Collects a binary response body as a Buffer.
const binary = (res, callback) => {
  const chunks = [];
  res.on("data", (chunk) => chunks.push(chunk));
  res.on("end", () => callback(null, Buffer.concat(chunks)));
};
const errorCode = (res) => JSON.parse(res.body.toString()).error.code;
const getAudio = (id, cookie) => {
  const req = request(app).get(`/api/feedback/${id}/audio`).buffer(true).parse(binary);
  return cookie ? req.set("Cookie", cookie) : req;
};

// --- Public upload ----------------------------------------------------------------

describe("POST /api/public/f/:slug/submit-voice", () => {
  it("stores the recording privately in the right business and confirms after saving", async () => {
    await owner("a");
    const b = await owner("b");
    const link = (await request(app).post("/api/links").set("Cookie", b.cookie).send({ name: "Table 4" })).body.link;
    const audio = AUDIO.webm(6000);

    const res = await submitVoice(b.slug, {
      file: audio,
      fields: { category: "complaint", linkCode: link.code, customerName: " Sam ", customerEmail: "Sam@Example.com", durationSec: "8.27" },
    });
    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(["submitted", "submittedAt"]);

    const saved = await Feedback.findOne({}).lean();
    expect(String(saved.businessId)).toBe(b.business.id);
    expect(String(saved.organizationId)).toBe(b.orgId);
    expect(String(saved.linkId)).toBe(link.id);
    expect(saved).toMatchObject({
      submissionType: "voice",
      category: "complaint",
      complaintStatus: "open",
      message: "",
      customerName: "Sam",
      customerEmail: "sam@example.com",
      audioMimeType: "audio/webm",
      audioSizeBytes: 6000,
      audioDurationSec: 8.3,
      transcriptStatus: "unavailable",
      transcriptText: "",
    });
    expect(saved.audioKey).toMatch(new RegExp(`^${b.business.id}/[a-f0-9]{32}\\.webm$`));

    expect(await storedFiles()).toEqual([saved.audioKey]);
    const onDisk = await readFile(path.join(getStorage().root, ...saved.audioKey.split("/")));
    expect(onDisk.equals(audio)).toBe(true);
  });

  it.each(Object.entries({ ogg: "audio/ogg", mp4: "audio/mp4", mpeg: "audio/mpeg", wav: "audio/wav" }))(
    "accepts %s recordings",
    async (format, contentType) => {
      const o = await owner("a");
      const res = await submitVoice(o.slug, { file: AUDIO[format](), contentType });
      expect(res.status).toBe(201);
      const saved = await Feedback.findOne({});
      expect(saved.audioMimeType).toBe(contentType);
      expect(await storedFiles()).toHaveLength(1);
    }
  );

  it.each([
    ["content that isn't audio (wrong magic bytes)", { file: Buffer.from(`<html>${"x".repeat(4000)}</html>`) }, 400],
    ["a declared type that doesn't match the content", { file: AUDIO.webm(), contentType: "audio/ogg" }, 400],
    ["Matroska video posing as webm", { file: withHeader([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x88], 4000) }, 400],
    ["a file over 5 MB", { file: AUDIO.webm(5 * 1024 * 1024 + 1), fields: { durationSec: "120" } }, 413],
    ["an unsupported type", { file: AUDIO.webm(), contentType: "video/webm" }, 400],
    ["a text file", { file: Buffer.from("hello".repeat(100)), contentType: "text/plain" }, 400],
    ["an empty file", { file: AUDIO.webm(40) }, 400],
    ["no audio at all", { file: null }, 400],
    ["a missing idempotency key", { fields: { idempotencyKey: undefined } }, 400],
    ["a malformed idempotency key", { fields: { idempotencyKey: "short" } }, 400],
    ["a duration over 120 seconds", { fields: { durationSec: "120.5" } }, 400],
    ["a missing duration", { fields: { durationSec: undefined } }, 400],
    ["a non-numeric duration", { fields: { durationSec: "1e3" } }, 400],
    ["a duration far too short for the size", { file: AUDIO.webm(4 * 1024 * 1024), fields: { durationSec: "1" } }, 400],
    ["an unknown category", { fields: { category: "praise" } }, 400],
    ["an invalid email", { fields: { customerEmail: "not-an-email" } }, 400],
  ])("rejects %s and stores nothing", async (label, options, status) => {
    const o = await owner("a");
    const res = await submitVoice(o.slug, options);
    expect(res.status).toBe(status);
    expect(res.body.error).toBeDefined();
    expect(await Feedback.countDocuments()).toBe(0);
    expect(await storedFiles()).toEqual([]);
  });

  it("rejects a second audio file", async () => {
    const o = await owner("a");
    const res = await submitVoice(o.slug).attach("audio", AUDIO.webm(), { filename: "two", contentType: "audio/webm" });
    expect(res.status).toBe(400);
    expect(await Feedback.countDocuments()).toBe(0);
    expect(await storedFiles()).toEqual([]);
  });

  it("stores one record and one file for a repeated idempotency key, even concurrently", async () => {
    const o = await owner("a");
    const fields = { idempotencyKey: key() };

    const first = await submitVoice(o.slug, { fields });
    const again = await submitVoice(o.slug, { fields });
    const concurrent = await Promise.all([submitVoice(o.slug, { fields }), submitVoice(o.slug, { fields })]);

    for (const res of [first, again, ...concurrent]) {
      expect(res.status).toBe(201);
      expect(res.body.submittedAt).toBe(first.body.submittedAt);
    }
    expect(await Feedback.countDocuments()).toBe(1);
    expect(await storedFiles()).toEqual([(await Feedback.findOne()).audioKey]);
  });

  it("removes the stored file if the database save fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {}); // expected 500 log
    const o = await owner("a");
    vi.spyOn(Feedback, "create").mockRejectedValueOnce(new Error("Simulated database failure"));

    const res = await submitVoice(o.slug);
    expect(res.status).toBe(500);
    expect(res.body.submitted).toBeUndefined();
    expect(await Feedback.countDocuments()).toBe(0);
    expect(await storedFiles()).toEqual([]);
  });

  it("returns the generic 404 for unknown pages, inactive links and suspended accounts, storing nothing", async () => {
    const o = await owner("a");
    const link = (await request(app).post("/api/links").set("Cookie", o.cookie).send({ name: "Bar" })).body.link;
    await request(app).patch(`/api/links/${link.id}`).set("Cookie", o.cookie).send({ isActive: false });

    const cases = [
      ["unknown slug", () => submitVoice("no-such-shop")],
      ["inactive link", () => submitVoice(o.slug, { fields: { linkCode: link.code } })],
      ["unknown link", () => submitVoice(o.slug, { fields: { linkCode: "zzzzzzzz" } })],
    ];
    for (const [label, send] of cases) {
      const res = await send();
      expect(res.status, label).toBe(404);
      expect(res.body.error.message).toBe("This feedback page isn't available");
    }
    await Organization.updateOne({ _id: o.orgId }, { accessStatus: "suspended" });
    const suspended = await submitVoice(o.slug);
    expect(suspended.status).toBe(404);
    expect(suspended.body.error.message).toBe("This feedback page isn't available");

    expect(await Feedback.countDocuments()).toBe(0);
    expect(await storedFiles()).toEqual([]);
  });

  it("is rate limited more strictly than text feedback, on its own counter", async () => {
    const o = await owner("a");
    const strictApp = createApp({ limits: { public: 100, submit: 10, voice: 2 } });

    expect((await submitVoice(o.slug, { target: strictApp })).status).toBe(201);
    expect((await submitVoice(o.slug, { target: strictApp })).status).toBe(201);
    const blocked = await submitVoice(o.slug, { target: strictApp });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");

    const text = await request(strictApp)
      .post(`/api/public/f/${o.slug}/submit`)
      .send({ category: "general", message: "Hi", idempotencyKey: key() });
    expect(text.status).toBe(201);
    expect(await storedFiles()).toHaveLength(2);
  });

  it("never returns storage keys, paths or ids from public routes", async () => {
    const o = await owner("a");
    const res = await submitVoice(o.slug);
    const saved = await Feedback.findOne();
    const page = await request(app).get(`/api/public/f/${o.slug}`);

    for (const r of [res, page]) {
      const text = JSON.stringify(r.body);
      expect(text).not.toContain(saved.audioKey);
      expect(text).not.toContain(saved.audioKey.split("/")[1]);
      expect(text).not.toContain(o.business.id);
      expect(text).not.toMatch(/audio|storage|transcript|"id"|_id/i);
    }
  });
});

// --- Owner inbox -------------------------------------------------------------------

describe("GET /api/feedback/:id/audio", () => {
  it("streams the recording to its owner, privately and with the right type", async () => {
    const a = await owner("a");
    const audio = AUDIO.ogg(5000);
    await submitVoice(a.slug, { file: audio, contentType: "audio/ogg;codecs=opus" });
    const saved = await Feedback.findOne();

    const res = await getAudio(saved._id, a.cookie);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("audio/ogg");
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(res.headers["content-length"]).toBe("5000");
    expect(res.body.equals(audio)).toBe(true);
  });

  it("returns 404 to another owner, for text feedback, unknown ids and missing files", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {}); // logged missing file
    const a = await owner("a");
    const b = await owner("b");
    await submitVoice(a.slug);
    const voice = await Feedback.findOne({ submissionType: "voice" });
    await request(app).post(`/api/public/f/${a.slug}/submit`).send({ category: "general", message: "Hi", idempotencyKey: key() });
    const text = await Feedback.findOne({ submissionType: "text" });

    const other = await getAudio(voice._id, b.cookie);
    expect(other.status).toBe(404);
    expect(other.headers["content-type"]).toMatch(/json/);
    expect((await getAudio(text._id, a.cookie)).status).toBe(404);
    expect((await getAudio(new Feedback()._id, a.cookie)).status).toBe(404);
    expect((await getAudio("not-an-id", a.cookie)).status).toBe(404);

    await rm(path.join(getStorage().root, ...voice.audioKey.split("/")));
    expect((await getAudio(voice._id, a.cookie)).status).toBe(404);
  });

  it("refuses logged-out, pending, suspended and Super Admin callers", async () => {
    const a = await owner("a");
    await submitVoice(a.slug);
    const { _id: id } = await Feedback.findOne();

    expect((await getAudio(id)).status).toBe(401);

    const pending = await request(app)
      .post("/api/auth/register")
      .send({ name: "P", email: "p@p.test", password: PASSWORD, organizationName: "P org" });
    const pendingRes = await getAudio(id, pending.headers["set-cookie"][0].split(";")[0]);
    expect(pendingRes.status).toBe(403);
    expect(errorCode(pendingRes)).toBe("ACCESS_PENDING");

    const admin = await User.create({
      name: "Ops",
      email: "ops@voiceloop.test",
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role: "superadmin",
    });
    const adminRes = await getAudio(id, `${SESSION_COOKIE}=${signSession(admin._id)}`);
    expect(adminRes.status).toBe(403);
    expect(errorCode(adminRes)).toBe("FORBIDDEN");

    await Organization.updateOne({ _id: a.orgId }, { accessStatus: "suspended" });
    const suspended = await getAudio(id, a.cookie);
    expect(suspended.status).toBe(403);
    expect(errorCode(suspended)).toBe("ACCESS_SUSPENDED");
  });
});

describe("voice feedback in the inbox", () => {
  it("shows audio metadata and an honest transcript status, never the storage key", async () => {
    const a = await owner("a");
    await submitVoice(a.slug, { fields: { durationSec: "42" } });
    const saved = await Feedback.findOne();

    const detail = await request(app).get(`/api/feedback/${saved._id}`).set("Cookie", a.cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.feedback).toMatchObject({
      submissionType: "voice",
      message: "",
      audio: { mimeType: "audio/webm", sizeBytes: 4000, durationSec: 42 },
      transcriptStatus: "unavailable",
      transcriptText: "",
    });

    const list = await request(app).get("/api/feedback").set("Cookie", a.cookie);
    expect(list.body.feedback[0]).toMatchObject({ submissionType: "voice", audioDurationSec: 42, transcriptStatus: "unavailable", excerpt: "" });

    for (const res of [detail, list]) {
      expect(JSON.stringify(res.body)).not.toContain(saved.audioKey);
      expect(JSON.stringify(res.body)).not.toMatch(/audioKey|storage/);
    }
  });

  it("filters by submission type and transcript status", async () => {
    const a = await owner("a");
    await submitVoice(a.slug);
    await request(app).post(`/api/public/f/${a.slug}/submit`).send({ category: "general", message: "Typed", idempotencyKey: key() });
    const list = (query) => request(app).get(`/api/feedback?${query}`).set("Cookie", a.cookie);

    expect((await list("submissionType=voice")).body.feedback.map((f) => f.submissionType)).toEqual(["voice"]);
    expect((await list("submissionType=text")).body.feedback.map((f) => f.excerpt)).toEqual(["Typed"]);
    expect((await list("transcriptStatus=unavailable")).body.total).toBe(1);
    expect((await list("transcriptStatus=completed")).body.total).toBe(0);
    expect((await list("submissionType=video")).status).toBe(400);
    expect((await list("transcriptStatus=done")).status).toBe(400);
  });
});

// --- Storage and transcription configuration -------------------------------------------

describe("storage drivers", () => {
  it("refuses keys that could escape the storage folder", async () => {
    const storage = getStorage();
    for (const bad of ["../x.webm", "a/../../b.webm", "/etc/passwd", "C:\\x.webm", `${"a".repeat(24)}/${"b".repeat(32)}.exe`]) {
      await expect(storage.put(bad, Buffer.from("x")), bad).rejects.toThrow("Invalid storage key");
      await expect(storage.getStream(bad), bad).rejects.toThrow("Invalid storage key");
    }
  });

  // The S3 driver itself is covered in s3Storage.test.js.
  it("refuses an S3 driver without its settings, and unknown drivers", async () => {
    expect(() => createStorage({ STORAGE_DRIVER: "s3" })).toThrow(/STORAGE_DRIVER is "s3" but .* not set/);
    const s3 = createStorage({
      STORAGE_DRIVER: "s3",
      S3_BUCKET: "b",
      S3_REGION: "auto",
      S3_ACCESS_KEY_ID: "k",
      S3_SECRET_ACCESS_KEY: "s",
    });
    expect(s3.name).toBe("s3");
    await expect(s3.put("x", Buffer.from("x"))).rejects.toThrow("Invalid storage key");
    expect(() => createStorage({ STORAGE_DRIVER: "ftp" })).toThrow(/Unknown STORAGE_DRIVER/);
  });
});
