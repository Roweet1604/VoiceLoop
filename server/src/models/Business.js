import mongoose from "mongoose";

// A business that collects feedback. Each organization has at most one for
// now (enforced by the unique index on organizationId).
//
// Text fields are stored exactly as entered. They are never HTML-escaped in
// the database; the client renders them as plain text.
const businessSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      unique: true,
      immutable: true,
    },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    locationName: { type: String, trim: true, maxlength: 80, default: "" },
    welcomeMessage: { type: String, trim: true, maxlength: 300, default: "" },
    googleReviewUrl: { type: String, trim: true, maxlength: 500, default: "" },
    logoUrl: { type: String, trim: true, maxlength: 500, default: "" },
    // Used in the public feedback URL /f/<publicSlug>. Set once at creation and
    // never changed, so printed QR codes and shared links keep working.
    publicSlug: { type: String, required: true, unique: true, immutable: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Business = mongoose.model("Business", businessSchema);
