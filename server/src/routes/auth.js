import { Router } from "express";
import bcrypt from "bcrypt";
import { User } from "../models/User.js";
import { Organization } from "../models/Organization.js";
import { AppError } from "../utils/AppError.js";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { registerBody, loginBody, forgotPasswordBody, resetPasswordBody } from "../validators/auth.js";
import { requestPasswordReset, resetPassword } from "../services/passwordReset.js";
import { signSession, setSessionCookie, clearSessionCookie } from "../utils/session.js";

const BCRYPT_ROUNDS = 12;
// Compared against when the email is unknown, so a missing account takes about
// as long to reject as a wrong password and response time doesn't reveal which.
const DUMMY_HASH = bcrypt.hashSync("voiceloop-timing-equalizer", BCRYPT_ROUNDS);

function sessionPayload(user, organization) {
  return {
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
    organization: organization && {
      id: organization._id,
      name: organization.name,
      accessStatus: organization.accessState().status,
      accessStartsAt: organization.accessStartsAt,
      accessExpiresAt: organization.accessExpiresAt,
    },
  };
}

export function createAuthRouter({ loginLimiter, registerLimiter, forgotLimiter, resetLimiter }) {
  const router = Router();

  // Same answer, sent before any lookup, for every valid email: whether an
  // account exists can't be told from the response or its timing. The link
  // is created and emailed afterwards (services/passwordReset.js).
  router.post("/forgot-password", forgotLimiter, validate({ body: forgotPasswordBody }), (req, res) => {
    requestPasswordReset(req.body.email);
    res.json({ message: "If an account exists for that email, we sent a link to reset the password." });
  });

  // Not logged in afterwards: every session, including any on this device,
  // ends with the reset (requireAuth checks passwordChangedAt).
  router.post("/reset-password", resetLimiter, validate({ body: resetPasswordBody }), async (req, res) => {
    await resetPassword({ token: req.body.token, newPassword: req.body.newPassword });
    clearSessionCookie(res);
    res.json({ message: "Your password was changed. Log in with your new password." });
  });

  router.post("/register", registerLimiter, validate({ body: registerBody }), async (req, res) => {
    // Only these fields are read. Anything else in the body, including "role",
    // is ignored: public signup always creates an owner with a pending organization.
    const { name, email, password, organizationName } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    if (await User.exists({ email: normalizedEmail })) {
      throw AppError.conflict("An account with this email already exists", "EMAIL_IN_USE");
    }

    const user = new User({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      role: "owner",
    });
    const organization = new Organization({
      name: organizationName.trim(),
      accessStatus: "pending",
      accessHistory: [{ action: "requested", fromStatus: null, toStatus: "pending", by: user._id }],
    });
    user.organizationId = organization._id;

    await organization.save();
    try {
      await user.save();
    } catch (err) {
      // Don't leave an orphaned organization behind if the user can't be saved.
      await Organization.deleteOne({ _id: organization._id });
      if (err.code === 11000) {
        throw AppError.conflict("An account with this email already exists", "EMAIL_IN_USE");
      }
      throw err;
    }

    setSessionCookie(res, signSession(user._id));
    res.status(201).json(sessionPayload(user, organization));
  });

  router.post("/login", loginLimiter, validate({ body: loginBody }), async (req, res) => {
    const email = req.body.email.trim().toLowerCase();
    const user = await User.findOne({ email }).select("+passwordHash");

    const passwordOk = await bcrypt.compare(req.body.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !passwordOk) {
      throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }

    // Login succeeds for pending, rejected or suspended accounts too, so the
    // client can show the right status page. Feature routes check access.
    user.lastLoginAt = new Date();
    await user.save();
    const organization = user.organizationId ? await Organization.findById(user.organizationId) : null;

    setSessionCookie(res, signSession(user._id));
    res.json(sessionPayload(user, organization));
  });

  router.post("/logout", (req, res) => {
    clearSessionCookie(res);
    res.status(204).end();
  });

  // Deliberately not behind requireActiveAccess: a pending user needs this to
  // see the waiting-for-approval page.
  router.get("/me", requireAuth, (req, res) => {
    res.json(sessionPayload(req.user, req.organization));
  });

  return router;
}
