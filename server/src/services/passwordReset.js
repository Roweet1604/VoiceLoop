// Password reset by emailed link.
//
// Requesting a link always looks the same to the caller: the route answers
// before any of the work below runs, so neither the response nor its timing
// shows whether the email belongs to an account.
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Organization } from "../models/Organization.js";
import { PasswordResetToken } from "../models/PasswordResetToken.js";
import { AuditLog } from "../models/AuditLog.js";
import { AppError } from "../utils/AppError.js";
import { sendEmail } from "./email/index.js";

export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
// At most this many links per account per hour; further requests are
// silently skipped (the caller still sees the generic answer).
export const RESETS_PER_ACCOUNT_PER_HOUR = 3;
const HOUR_MS = 60 * 60 * 1000;
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url

export const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const invalidLink = () =>
  new AppError("This reset link is invalid or has expired. Request a new one.", 400, "INVALID_RESET_TOKEN");

function resetEmail(link) {
  const minutes = RESET_TOKEN_TTL_MS / 60000;
  return {
    subject: "Reset your VoiceLoop password",
    text: [
      "Someone asked to reset the password for your VoiceLoop account.",
      "",
      `Choose a new password here (the link works once, for ${minutes} minutes):`,
      link,
      "",
      "If you didn't ask for this, ignore this email. Your password stays the same.",
    ].join("\n"),
    // The link only contains URL-safe characters and CLIENT_URL; it is still
    // escaped for the attribute.
    html: `<p>Someone asked to reset the password for your VoiceLoop account.</p>
<p><a href="${link.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">Choose a new password</a>. The link works once, for ${minutes} minutes.</p>
<p>If you didn't ask for this, ignore this email. Your password stays the same.</p>`,
  };
}

// Creates a new link for a user: 32 random bytes, only their SHA-256 hash
// stored, valid RESET_TOKEN_TTL_MS. Only the newest link works: older unused
// ones are retired. The token exists only in the returned link; never log it.
async function issueResetLink(userId, now, session) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + RESET_TOKEN_TTL_MS);
  await PasswordResetToken.updateMany({ userId, usedAt: null }, { $set: { usedAt: now } }, { session });
  await PasswordResetToken.create([{ userId, tokenHash: hashToken(token), expiresAt }], { session });

  const clientUrl = (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/+$/, "");
  return { token, link: `${clientUrl}/reset-password?token=${token}`, expiresAt };
}

/**
 * A reset link for an account's owner, created by the Super Admin to hand
 * over by other means. Nothing is emailed. The link is returned only here;
 * the audit entry ("reset_link_created") holds no token and no email.
 * Accounts that include a Super Admin can't be targeted.
 */
export async function createResetLinkForAccount({ organizationId, actor }) {
  if (!mongoose.isValidObjectId(organizationId)) throw AppError.notFound("Account not found");

  let result;
  await mongoose.connection.transaction(async (session) => {
    const now = new Date();
    const organization = await Organization.findById(organizationId).session(session);
    if (!organization) throw AppError.notFound("Account not found");
    if (await User.exists({ organizationId: organization._id, role: "superadmin" }).session(session)) {
      throw AppError.forbidden("Reset links can't be created for accounts that include a Super Admin");
    }
    const owner = await User.findOne({ organizationId: organization._id, role: "owner" }).sort({ createdAt: 1 }).session(session);
    if (!owner) throw AppError.notFound("This account has no owner");

    const { link, expiresAt } = await issueResetLink(owner._id, now, session);
    await AuditLog.create(
      [
        {
          actor: actor._id,
          action: "reset_link_created",
          targetType: "Organization",
          targetId: organization._id,
          context: { organizationName: organization.name },
          createdAt: now,
        },
      ],
      { session }
    );
    result = { link, expiresAt };
  });
  return result;
}

// Work still running after its response was sent (tests wait for it).
const pending = new Set();
export async function waitForPendingResets() {
  await Promise.allSettled([...pending]);
}

async function processRequest(email) {
  const user = await User.findOne({ email }).select("_id email");
  if (!user) return; // Nothing to do, and nothing different to show.

  const now = new Date();
  const recent = await PasswordResetToken.countDocuments({ userId: user._id, createdAt: { $gt: new Date(now - HOUR_MS) } });
  if (recent >= RESETS_PER_ACCOUNT_PER_HOUR) {
    console.warn(`[auth] password reset limit reached for user ${user._id}; no email sent`);
    return;
  }

  const { token, link } = await issueResetLink(user._id, now);
  await sendEmail({ to: user.email, ...resetEmail(link), idempotencyKey: `password-reset-${hashToken(token)}` });
}

// Starts handling a reset request without waiting for it. Failures are
// logged (without the token) and never reach the caller.
export function requestPasswordReset(email) {
  const job = processRequest(email.trim().toLowerCase())
    .catch((err) => console.error(`[auth] password reset request failed: ${err.name}: ${err.message}`))
    .finally(() => pending.delete(job));
  pending.add(job);
}

/**
 * Sets a new password for the holder of a valid link. Every invalid case
 * (malformed, unknown, used, expired, deleted user) is the same error.
 * Claiming the token and changing the password happen in one transaction,
 * so a link can never be used twice, even by two requests at once.
 */
export async function resetPassword({ token, newPassword }) {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) throw invalidLink();
  const passwordHash = await bcrypt.hash(newPassword, 12);

  await mongoose.connection.transaction(async (session) => {
    const now = new Date();
    const claimed = await PasswordResetToken.findOneAndUpdate(
      { tokenHash: hashToken(token), usedAt: null, expiresAt: { $gt: now } },
      { $set: { usedAt: now } },
      { session, new: true }
    );
    if (!claimed) throw invalidLink();

    const updated = await User.updateOne(
      { _id: claimed.userId },
      { $set: { passwordHash, passwordChangedAt: now } },
      { session }
    );
    if (updated.matchedCount === 0) throw invalidLink();

    // Any other outstanding links for this account stop working too.
    await PasswordResetToken.updateMany({ userId: claimed.userId, usedAt: null }, { $set: { usedAt: now } }, { session });
  });
}
