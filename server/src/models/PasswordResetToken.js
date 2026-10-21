import mongoose from "mongoose";

// One password reset link. Only the SHA-256 hash of the token is stored: the
// token itself exists only in the emailed link, so a database leak can't be
// used to reset passwords. Removed with the user's account
// (services/accountDeletion.js, USER_DATA).
const passwordResetTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  tokenHash: { type: String, required: true, unique: true, immutable: true },
  expiresAt: { type: Date, required: true },
  // Set when the link is used, or when a newer link replaces it.
  usedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now, immutable: true },
});

// MongoDB deletes records a day after they expire. They're kept that long so
// the per-account limit (recent requests per hour) can still count them.
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });
passwordResetTokenSchema.index({ userId: 1, createdAt: -1 });

export const PasswordResetToken = mongoose.model("PasswordResetToken", passwordResetTokenSchema);
