import { Router } from "express";
import { FeedbackLink } from "../models/FeedbackLink.js";
import { Feedback } from "../models/Feedback.js";
import { validate } from "../middleware/validate.js";
import { requireAuth, requireActiveAccess, requireOwner } from "../middleware/auth.js";
import { ownBusiness } from "../services/ownBusiness.js";
import { feedbackFilter } from "../services/feedbackFilter.js";
import { listFeedbackQuery } from "../validators/inbox.js";
import { csvRow } from "../utils/csv.js";

export const EXPORT_ROW_LIMIT = 10_000;

// Deliberately limited to what an owner needs in a spreadsheet: no ids,
// internal notes, audio keys or transcripts.
const COLUMNS = [
  ["Submitted at (UTC)", (f) => f.submittedAt.toISOString()],
  ["Category", (f) => f.category],
  ["Type", (f) => f.submissionType],
  ["Message", (f) => f.message ?? ""],
  ["Customer name", (f) => f.customerName],
  ["Customer email", (f) => f.customerEmail],
  ["Source", (f, linkName) => (f.linkId ? (linkName.get(String(f.linkId)) ?? "") : "")],
  ["Review status", (f) => f.reviewStatus],
  ["Complaint status", (f) => f.complaintStatus ?? ""],
  ["Resolution summary", (f) => f.resolutionSummary ?? ""],
];
// Resolves when the response can take more data, or when the connection
// closed (then the loop below stops).
const drained = (res) =>
  new Promise((resolve) => {
    const done = () => {
      res.off("drain", done);
      res.off("close", done);
      resolve();
    };
    res.on("drain", done);
    res.on("close", done);
  });

const FIELDS = "submittedAt category submissionType message customerName customerEmail linkId reviewStatus complaintStatus resolutionSummary";

// GET /api/feedback/export.csv: the inbox's current filters as a CSV file,
// newest first, at most `rowLimit` rows. Headers say whether it was cut off:
// X-Export-Total (matching rows), X-Export-Rows (rows in the file),
// X-Export-Truncated ("true"/"false") and X-Export-Row-Limit.
export function createExportRouter({ rowLimit = EXPORT_ROW_LIMIT } = {}) {
  const router = Router();
  router.use(requireAuth, requireActiveAccess, requireOwner);

  router.get("/", validate({ query: listFeedbackQuery }), async (req, res) => {
    const business = await ownBusiness(req);
    const filter = feedbackFilter(business._id, req.query);

    const [total, links] = await Promise.all([
      Feedback.countDocuments(filter),
      FeedbackLink.find({ businessId: business._id }).select("name").lean(),
    ]);
    const linkName = new Map(links.map((l) => [String(l._id), l.name]));
    const rows = Math.min(total, rowLimit);

    // The slug only contains [a-z0-9-]; the replace keeps that true regardless.
    const slug = business.publicSlug.replace(/[^a-z0-9-]/g, "") || "business";
    const filename = `voiceloop-feedback-${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Export-Total": String(total),
      "X-Export-Rows": String(rows),
      "X-Export-Truncated": String(total > rowLimit),
      "X-Export-Row-Limit": String(rowLimit),
    });

    // The byte order mark makes Excel read the file as UTF-8.
    res.write(`﻿${csvRow(COLUMNS.map(([header]) => header))}`);

    const cursor = Feedback.find(filter).sort({ submittedAt: -1, _id: -1 }).limit(rowLimit).select(FIELDS).lean().cursor();
    try {
      for await (const feedback of cursor) {
        if (res.destroyed) break; // the browser went away
        if (!res.write(csvRow(COLUMNS.map(([, value]) => value(feedback, linkName))))) await drained(res);
      }
    } catch (err) {
      // Headers are sent, so there is no error response to give: cut the
      // download off so it can't be mistaken for a complete file.
      console.error("[export] CSV export failed part-way", err);
      res.destroy();
      return;
    } finally {
      await cursor.close();
    }
    res.end();
  });

  return router;
}
