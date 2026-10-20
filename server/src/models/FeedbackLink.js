import mongoose from "mongoose";

// A named entry point for feedback (e.g. "Reception", "Table 4"), reached at
// /f/<business slug>/<code>. Deactivating a link stops new submissions through
// it but never removes the feedback already collected.
const feedbackLinkSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true, immutable: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    // Random, unguessable and permanent, so printed QR codes keep working.
    code: { type: String, required: true, unique: true, immutable: true },
    isActive: { type: Boolean, default: true },
    // The "Main link" created with every business; it also serves /f/<slug>.
    isDefault: { type: Boolean, default: false, immutable: true },
  },
  { timestamps: true }
);

feedbackLinkSchema.index({ businessId: 1, createdAt: 1 });
// At most one default link per business, so creating it is safe to repeat.
feedbackLinkSchema.index(
  { businessId: 1 },
  { unique: true, partialFilterExpression: { isDefault: true }, name: "one_default_link_per_business" }
);

export const FeedbackLink = mongoose.model("FeedbackLink", feedbackLinkSchema);
