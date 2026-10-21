import mongoose from "mongoose";

export const FEEDBACK_CATEGORIES = ["general", "complaint", "suggestion", "compliment", "other"];
export const REVIEW_STATUSES = ["new", "reviewed"];
export const COMPLAINT_STATUSES = ["open", "in_progress", "resolved"];
export const SUBMISSION_TYPES = ["text", "voice"];
// "unavailable": no speech-to-text provider was configured when it arrived.
export const TRANSCRIPT_STATUSES = ["unavailable", "processing", "completed", "failed"];
export const NOTE_MAX = 1000;
export const RESOLUTION_SUMMARY_MAX = 1000;

// Owner-only notes. Never included in any public response.
const internalNoteSchema = new mongoose.Schema({
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, required: true, trim: true, maxlength: NOTE_MAX },
  createdAt: { type: Date, default: Date.now },
});

// One entry per change of reviewStatus or complaintStatus: who, what, when.
const statusChangeSchema = new mongoose.Schema(
  {
    field: { type: String, enum: ["reviewStatus", "complaintStatus"], required: true },
    from: { type: String, default: null },
    to: { type: String, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    at: { type: Date, default: Date.now },
    // Set when a complaint is resolved.
    resolutionSummary: { type: String, trim: true, maxlength: RESOLUTION_SUMMARY_MAX },
  },
  { _id: false }
);

// One customer submission. Text is stored exactly as entered; clients must
// render it as plain text. Everything here, including notes, history and the
// stored audio file, is removed with the organization (services/accountDeletion.js).
const feedbackSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true, immutable: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true },
    linkId: { type: mongoose.Schema.Types.ObjectId, ref: "FeedbackLink", default: null, immutable: true },
    category: { type: String, enum: FEEDBACK_CATEGORIES, required: true },
    // Required for text feedback; voice feedback has no message.
    message: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
      required: [function () { return this.submissionType !== "voice"; }, "Message is required"],
    },
    customerName: { type: String, trim: true, maxlength: 80, default: "" },
    customerEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
    submissionType: { type: String, enum: SUBMISSION_TYPES, default: "text", immutable: true },
    // Voice only. audioKey points into private storage (services/storage) and
    // is never sent to any client; audio is streamed by GET /api/feedback/:id/audio.
    audioKey: { type: String, default: null, immutable: true },
    audioMimeType: { type: String, default: null, immutable: true },
    audioSizeBytes: { type: Number, default: null, immutable: true },
    // Reported by the browser, sanity-checked against the size; approximate.
    audioDurationSec: { type: Number, default: null, immutable: true },
    transcriptStatus: { type: String, enum: [...TRANSCRIPT_STATUSES, null], default: null },
    // Only ever set by a real speech-to-text provider (none is configured).
    transcriptText: { type: String, default: "" },
    reviewStatus: { type: String, enum: REVIEW_STATUSES, default: "new" },
    // Only complaints have a status; everything else stays null.
    complaintStatus: { type: String, enum: [...COMPLAINT_STATUSES, null], default: null },
    // The current resolution; cleared on reopen (the history keeps old ones).
    resolutionSummary: { type: String, trim: true, maxlength: RESOLUTION_SUMMARY_MAX, default: "" },
    resolvedAt: { type: Date, default: null },
    internalNotes: { type: [internalNoteSchema], default: [] },
    statusHistory: { type: [statusChangeSchema], default: [] },
    submittedAt: { type: Date, default: Date.now, immutable: true },
    // Sent by the client with each submission so a retry (double tap, flaky
    // network) is recognised instead of stored twice.
    idempotencyKey: { type: String, required: true, immutable: true },
  },
  { timestamps: true }
);

// Inbox: every query is scoped to one business and sorted newest first; each
// filter gets a compound index with that sort.
feedbackSchema.index({ businessId: 1, submittedAt: -1 });
feedbackSchema.index({ businessId: 1, category: 1, submittedAt: -1 });
feedbackSchema.index({ businessId: 1, reviewStatus: 1, submittedAt: -1 });
feedbackSchema.index({ businessId: 1, complaintStatus: 1, submittedAt: -1 });
feedbackSchema.index({ businessId: 1, linkId: 1, submittedAt: -1 });
feedbackSchema.index({ businessId: 1, submissionType: 1, submittedAt: -1 });
feedbackSchema.index({ businessId: 1, transcriptStatus: 1, submittedAt: -1 });
feedbackSchema.index({ businessId: 1, idempotencyKey: 1 }, { unique: true });
feedbackSchema.index({ linkId: 1 });
// Automatic deletion (services/retention.js) looks across all businesses.
feedbackSchema.index({ submittedAt: 1 });

// Voice feedback must carry its audio; text feedback never does.
feedbackSchema.pre("validate", function () {
  if (this.submissionType === "voice") {
    if (!this.audioKey || !this.audioMimeType || !this.audioSizeBytes || !this.transcriptStatus) {
      this.invalidate("audioKey", "Voice feedback needs its audio metadata");
    }
  } else if (this.audioKey || this.transcriptStatus) {
    this.invalidate("audioKey", "Only voice feedback has audio");
  }
});

export const Feedback = mongoose.model("Feedback", feedbackSchema);
