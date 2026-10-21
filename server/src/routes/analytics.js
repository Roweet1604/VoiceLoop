import { Router } from "express";
import { FeedbackLink } from "../models/FeedbackLink.js";
import { Feedback, FEEDBACK_CATEGORIES } from "../models/Feedback.js";
import { validate } from "../middleware/validate.js";
import { requireAuth, requireActiveAccess, requireOwner } from "../middleware/auth.js";
import { ownBusiness } from "../services/ownBusiness.js";
import { keywordCounts, KEYWORD_MIN_COUNT, KEYWORD_LIMIT } from "../services/keywords.js";
import { analyticsQuery, analyticsRange } from "../validators/analytics.js";
import { addDays, startOfLocalDay } from "../utils/timeZone.js";
import { retentionDaysFrom } from "../services/retention.js";

const HOUR_MS = 60 * 60 * 1000;
// Upper bound on complaints read for keyword counts in one request.
const KEYWORD_SAMPLE_MAX = 5000;

const router = Router();

// Owners with active access only, and only ever their own business.
router.use(requireAuth, requireActiveAccess, requireOwner);

// The latest change to "resolved" in a complaint's history (after a reopen,
// the current resolution, not the first).
const lastResolution = (history) =>
  history.findLast((entry) => entry.field === "complaintStatus" && entry.to === "resolved");

// GET /api/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=Area/City
// Everything is counted from stored records for the range: feedback
// submitted in it, and complaints resolved in it.
router.get("/", validate({ query: analyticsQuery }), async (req, res) => {
  const business = await ownBusiness(req);
  const range = analyticsRange(req.query);
  const { timeZone } = range;
  const start = startOfLocalDay(range.from, timeZone);
  const end = startOfLocalDay(addDays(range.to, 1), timeZone); // exclusive
  const inRange = { businessId: business._id, submittedAt: { $gte: start, $lt: end } };
  const count = { $sum: 1 };

  const [[facets], links, resolvedComplaints, complaintTexts] = await Promise.all([
    Feedback.aggregate([
      { $match: inRange },
      {
        $facet: {
          total: [{ $count: "n" }],
          byCategory: [{ $group: { _id: "$category", count } }],
          byLink: [{ $group: { _id: "$linkId", count } }],
          byType: [{ $group: { _id: "$submissionType", count } }],
          complaintStatus: [{ $match: { category: "complaint" } }, { $group: { _id: "$complaintStatus", count } }],
          volume: [
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$submittedAt", timezone: timeZone } }, count } },
          ],
        },
      },
    ]),
    FeedbackLink.find({ businessId: business._id }).sort({ isDefault: -1, createdAt: 1 }).select("name isActive").lean(),
    // Complaints whose history has a resolution in the range (whenever they
    // were submitted). The latest resolution is checked again below.
    Feedback.find({
      businessId: business._id,
      category: "complaint",
      complaintStatus: "resolved",
      statusHistory: { $elemMatch: { field: "complaintStatus", to: "resolved", at: { $gte: start, $lt: end } } },
    })
      .select("submittedAt statusHistory")
      .lean(),
    Feedback.find({ ...inRange, category: "complaint" })
      .sort({ submittedAt: -1 })
      .limit(KEYWORD_SAMPLE_MAX)
      .select("message transcriptStatus transcriptText")
      .lean(),
  ]);

  const toMap = (rows) => new Map(rows.map((row) => [String(row._id), row.count]));
  const byCategory = toMap(facets.byCategory);
  const byLink = toMap(facets.byLink);
  const byType = toMap(facets.byType);
  const byStatus = toMap(facets.complaintStatus);
  const volume = toMap(facets.volume);

  const resolutionHours = resolvedComplaints
    .map((complaint) => ({ complaint, resolution: lastResolution(complaint.statusHistory) }))
    .filter(({ resolution }) => resolution && resolution.at >= start && resolution.at < end)
    .map(({ complaint, resolution }) => (resolution.at - complaint.submittedAt) / HOUR_MS);
  const averageHours = resolutionHours.length
    ? Math.round((resolutionHours.reduce((sum, h) => sum + h, 0) / resolutionHours.length) * 10) / 10
    : null;

  res.json({
    range,
    retentionDays: retentionDaysFrom(),
    total: facets.total[0]?.n ?? 0,
    volume: Array.from({ length: range.days }, (_, i) => {
      const date = addDays(range.from, i);
      return { date, count: volume.get(date) ?? 0 };
    }),
    byCategory: FEEDBACK_CATEGORIES.map((category) => ({ category, count: byCategory.get(category) ?? 0 })),
    byLink: links.map((link) => ({
      linkId: link._id,
      name: link.name,
      isActive: link.isActive,
      count: byLink.get(String(link._id)) ?? 0,
    })),
    unlinkedCount: byLink.get("null") ?? 0,
    bySubmissionType: { text: byType.get("text") ?? 0, voice: byType.get("voice") ?? 0 },
    complaints: {
      // Current status of the complaints received in the range. A complaint
      // without a status yet counts as open.
      received: [...byStatus.values()].reduce((sum, n) => sum + n, 0),
      open: (byStatus.get("open") ?? 0) + (byStatus.get("null") ?? 0),
      inProgress: byStatus.get("in_progress") ?? 0,
      resolved: byStatus.get("resolved") ?? 0,
      // Complaints whose current resolution happened in the range, and the
      // average time from submission to that resolution.
      resolvedInRange: resolutionHours.length,
      averageHoursToResolve: averageHours,
    },
    keywords: {
      method: "keyword counts",
      description:
        "Simple counts of words and two-word phrases in complaints received in this period, after removing common English words. Each complaint counts a term once. Not AI.",
      minCount: KEYWORD_MIN_COUNT,
      limit: KEYWORD_LIMIT,
      complaintsAnalyzed: complaintTexts.length,
      items: keywordCounts(
        complaintTexts.map((c) => [c.message, c.transcriptStatus === "completed" ? c.transcriptText : ""].join(" "))
      ),
    },
  });
});

export default router;
