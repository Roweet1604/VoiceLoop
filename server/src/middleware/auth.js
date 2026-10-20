import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Organization } from "../models/Organization.js";
import { AppError } from "../utils/AppError.js";
import { SESSION_COOKIE, verifySession, clearSessionCookie } from "../utils/session.js";

// Identifies the caller from the session cookie and loads the user and their
// organization fresh from the database. Pending, suspended and other
// non-active accounts pass this check; use requireActiveAccess to gate features.
export async function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) throw AppError.unauthorized();

  let payload;
  try {
    payload = verifySession(token);
  } catch (err) {
    clearSessionCookie(res);
    if (err.name === "TokenExpiredError") {
      throw new AppError("Your session has expired, please log in again", 401, "SESSION_EXPIRED");
    }
    throw AppError.unauthorized();
  }

  const user = mongoose.isValidObjectId(payload.sub) ? await User.findById(payload.sub) : null;
  if (!user) {
    clearSessionCookie(res);
    throw AppError.unauthorized();
  }

  req.user = user;
  req.organization = user.organizationId ? await Organization.findById(user.organizationId) : null;
  next();
}

// Must run after requireAuth. Only the Super Admin may continue; everyone
// else, including active owners, gets 403.
export function requireSuperAdmin(req, res, next) {
  if (req.user.role !== "superadmin") throw AppError.forbidden();
  next();
}

// Must run after requireAuth. Lets through only owners whose organization is
// currently active (not pending, rejected, suspended, or past its expiry).
// The Super Admin has no organization and is not subject to access periods.
export function requireActiveAccess(req, res, next) {
  if (req.user.role === "superadmin") return next();

  if (!req.organization) {
    throw new AppError("Your account is not linked to an organization", 403, "NO_ORGANIZATION");
  }

  const access = req.organization.accessState();
  if (!access.allowed) throw new AppError(access.message, 403, access.code);
  next();
}
