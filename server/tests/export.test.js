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
import { csvCell } from "../src/utils/csv.js";

const LIMITS = { api: 10000, login: 1000, register: 1000, public: 10000, submit: 10000, export: 10000 };
const app = createApp({ limits: LIMITS });
const PASSWORD = "correct-horse-battery";
const HEADER = [
  "Submitted at (UTC)",
  "Category",
  "Type",
  "Message",
  "Customer name",
  "Customer email",
  "Source",
  "Review status",
  "Complaint status",
  "Resolution summary",
];

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
    exportCsv: (query = "", target = app) => request(target).get(`/api/feedback/export.csv?${query}`).set("Cookie", cookie),
  };
}

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

// A strict RFC 4180 reader, so tests check what a spreadsheet would see.
function parseCsv(text) {
  expect(text.startsWith("﻿")).toBe(true);
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 1; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') {
      expect(field, "quote in the middle of an unquoted field").toBe("");
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r" && text[i + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
    } else {
      expect(c === "\r" || c === "\n", "bare line break outside quotes").toBe(false);
      field += c;
    }
  }
  expect(quoted, "unterminated quote").toBe(false);
  expect(field === "" && row.length === 0, "every row ends with CRLF").toBe(true);
  return rows;
}

const asObjects = (rows) => rows.slice(1).map((r) => Object.fromEntries(HEADER.map((h, i) => [h, r[i]])));

describe("access", () => {
  it("refuses logged-out, pending, suspended and Super Admin callers", async () => {
    const a = await owner("a");
    await seed(a);

    const anon = await request(app).get("/api/feedback/export.csv");
    expect(anon.status).toBe(401);
    expect(anon.headers["content-type"]).toMatch(/json/);

    const pending = await request(app)
      .post("/api/auth/register")
      .send({ name: "P", email: "p@p.test", password: PASSWORD, organizationName: "P org" });
    const pendingRes = await request(app)
      .get("/api/feedback/export.csv")
      .set("Cookie", pending.headers["set-cookie"][0].split(";")[0]);
    expect(pendingRes.status).toBe(403);
    expect(pendingRes.body.error.code).toBe("ACCESS_PENDING");

    const admin = await User.create({
      name: "Ops",
      email: "ops@voiceloop.test",
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role: "superadmin",
    });
    const adminRes = await request(app).get("/api/feedback/export.csv").set("Cookie", `${SESSION_COOKIE}=${signSession(admin._id)}`);
    expect(adminRes.status).toBe(403);

    await Organization.updateOne({ _id: a.orgId }, { accessStatus: "suspended" });
    const suspended = await a.exportCsv();
    expect(suspended.status).toBe(403);
    expect(suspended.body.error.code).toBe("ACCESS_SUSPENDED");
  });
});

describe("GET /api/feedback/export.csv", () => {
  it("exports only the owner's business, as a private CSV download", async () => {
    const a = await owner("a");
    const b = await owner("b");
    await seed(a, { message: "Only A wrote this" });
    await seed(b, { message: "Only B wrote this" });

    const res = await a.exportCsv();
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="voiceloop-feedback-shop-a-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.text).toContain("Only A wrote this");
    expect(res.text).not.toContain("Only B wrote this");
    expect(parseCsv(res.text)).toHaveLength(2);
  });

  it("has the documented columns and no notes, ids, audio keys or transcripts", async () => {
    const a = await owner("a");
    const table = await FeedbackLink.create({ businessId: a.business.id, organizationId: a.orgId, name: "Table 4", code: "table444" });
    const complaint = await seed(a, {
      at: "2026-05-02T09:30:00Z",
      category: "complaint",
      message: "Cold soup",
      customerName: "Sam",
      customerEmail: "sam@example.com",
      linkId: table._id,
      reviewStatus: "reviewed",
      complaintStatus: "resolved",
      resolutionSummary: "Refunded",
      internalNotes: [{ authorId: a.business.id, text: "SECRET NOTE" }],
    });
    const recording = await seed(a, {
      at: "2026-05-01T08:00:00Z",
      submissionType: "voice",
      message: "",
      audioKey: `${a.business.id}/${"f".repeat(32)}.webm`,
      audioMimeType: "audio/webm",
      audioSizeBytes: 1234,
      transcriptStatus: "completed",
      transcriptText: "SECRET TRANSCRIPT",
      linkId: null,
    });

    const res = await a.exportCsv();
    const rows = parseCsv(res.text);
    expect(rows[0]).toEqual(HEADER);
    expect(asObjects(rows)).toEqual([
      {
        "Submitted at (UTC)": "2026-05-02T09:30:00.000Z",
        Category: "complaint",
        Type: "text",
        Message: "Cold soup",
        "Customer name": "Sam",
        "Customer email": "sam@example.com",
        Source: "Table 4",
        "Review status": "reviewed",
        "Complaint status": "resolved",
        "Resolution summary": "Refunded",
      },
      {
        "Submitted at (UTC)": "2026-05-01T08:00:00.000Z",
        Category: "general",
        Type: "voice",
        Message: "",
        "Customer name": "",
        "Customer email": "",
        Source: "",
        "Review status": "new",
        "Complaint status": "",
        "Resolution summary": "",
      },
    ]);
    expect(res.text).not.toMatch(/SECRET|\.webm|[a-f0-9]{24}/);
    for (const id of [complaint._id, recording._id, a.business.id, a.orgId, table._id]) {
      expect(res.text).not.toContain(String(id));
    }
  });

  it("neutralizes cells that a spreadsheet would run as formulas", async () => {
    const a = await owner("a");
    // (Tab and carriage return can't start a stored field, which is trimmed;
    // csvCell is tested for them directly below.)
    const dangerous = ["=HYPERLINK(\"http://evil\",\"x\")", "+1+1", "-2+3", "@SUM(A1)"];
    for (const [i, message] of dangerous.entries()) {
      await seed(a, { message, customerName: i === 0 ? "=cmd|' /C calc'!A0" : "", at: new Date(Date.UTC(2026, 4, 1, i)).toISOString() });
    }
    await seed(a, { message: "Fine = 1 + 1 @ home - ok", at: "2026-04-01T00:00:00Z" });

    const records = asObjects(parseCsv((await a.exportCsv()).text));
    const messages = records.map((r) => r.Message);
    // Newest first: the seeded order reversed, then the harmless one.
    expect(messages).toEqual([...dangerous].reverse().map((m) => `'${m}`).concat("Fine = 1 + 1 @ home - ok"));
    expect(records.at(-2)["Customer name"]).toBe("'=cmd|' /C calc'!A0");
  });

  it("csvCell neutralizes every formula prefix, including tab and carriage return", () => {
    expect(["=1", "+1", "-1", "@a", "\tx", "\rx"].map(csvCell)).toEqual(["'=1", "'+1", "'-1", "'@a", "'\tx", "\"'\rx\""]);
    expect(["", null, undefined, "a=1", " =1", "plain"].map(csvCell)).toEqual(["", "", "", "a=1", " =1", "plain"]);
    expect(csvCell("=a,b")).toBe("\"'=a,b\"");
  });

  it("escapes commas, quotes and line breaks inside fields", async () => {
    const a = await owner("a");
    const message = 'He said "it\'s fine", then left.\nSecond line,\r\nthird line ""quoted""';
    await seed(a, { message, customerName: 'O"Brien, Pat' });

    const res = await a.exportCsv();
    const [record] = asObjects(parseCsv(res.text));
    expect(record.Message).toBe(message);
    expect(record["Customer name"]).toBe('O"Brien, Pat');
  });

  it("respects the inbox filters", async () => {
    const a = await owner("a");
    const table = await FeedbackLink.create({ businessId: a.business.id, organizationId: a.orgId, name: "Table 4", code: "table444" });
    await seed(a, { message: "general main", at: "2026-05-01T10:00:00Z" });
    await seed(a, { message: "complaint at table", category: "complaint", linkId: table._id, at: "2026-05-02T10:00:00Z" });
    await seed(a, { message: "resolved complaint", category: "complaint", complaintStatus: "resolved", reviewStatus: "reviewed", at: "2026-05-03T10:00:00Z" });
    await seed(a, {
      message: "",
      submissionType: "voice",
      audioKey: "k",
      audioMimeType: "audio/webm",
      audioSizeBytes: 100,
      transcriptStatus: "unavailable",
      at: "2026-05-04T10:00:00Z",
    });

    const messages = async (query) => asObjects(parseCsv((await a.exportCsv(query)).text)).map((r) => r.Message);
    expect(await messages("category=complaint")).toEqual(["resolved complaint", "complaint at table"]);
    expect(await messages("complaintStatus=open")).toEqual(["complaint at table"]);
    expect(await messages("reviewStatus=reviewed")).toEqual(["resolved complaint"]);
    expect(await messages(`linkId=${table._id}`)).toEqual(["complaint at table"]);
    expect(await messages("submissionType=voice")).toEqual([""]);
    expect(await messages("submissionType=text&q=COMPLAINT")).toEqual(["resolved complaint", "complaint at table"]);
    expect(await messages("from=2026-05-02T00:00:00Z&to=2026-05-03T23:59:59Z")).toEqual(["resolved complaint", "complaint at table"]);

    const invalid = await a.exportCsv("category=praise");
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.details).toHaveProperty("category");
    expect((await a.exportCsv("linkId=not-an-id")).status).toBe(400);
  });

  it("stops at the row cap, newest first, and says so in headers", async () => {
    const a = await owner("a");
    const capped = createApp({ limits: { ...LIMITS, exportRows: 3 } });
    for (let day = 1; day <= 5; day++) await seed(a, { message: `day ${day}`, at: `2026-05-0${day}T00:00:00Z` });

    const over = await a.exportCsv("", capped);
    expect(over.status).toBe(200);
    expect(asObjects(parseCsv(over.text)).map((r) => r.Message)).toEqual(["day 5", "day 4", "day 3"]);
    expect(over.headers).toMatchObject({
      "x-export-total": "5",
      "x-export-rows": "3",
      "x-export-truncated": "true",
      "x-export-row-limit": "3",
    });

    const under = await a.exportCsv("from=2026-05-04T00:00:00Z", capped);
    expect(parseCsv(under.text)).toHaveLength(3);
    expect(under.headers).toMatchObject({ "x-export-total": "2", "x-export-rows": "2", "x-export-truncated": "false" });

    // The real default.
    expect((await a.exportCsv()).headers["x-export-row-limit"]).toBe("10000");
  });

  it("exports just the header row when nothing matches", async () => {
    const a = await owner("a");
    const res = await a.exportCsv();
    expect(res.status).toBe(200);
    expect(parseCsv(res.text)).toEqual([HEADER]);
    expect(res.headers["x-export-truncated"]).toBe("false");
  });
});
