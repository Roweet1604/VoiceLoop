import jwt from "jsonwebtoken";

export const SESSION_COOKIE = "vl_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const MIN_SECRET_LENGTH = 32;

function secret() {
  return process.env.JWT_SECRET;
}

export function assertSessionConfig() {
  const value = secret();
  if (!value || value.length < MIN_SECRET_LENGTH || value.includes("replace")) {
    throw new Error(`JWT_SECRET must be set to a random string of at least ${MIN_SECRET_LENGTH} characters`);
  }
}

// The token only identifies the user. Role and access status are always
// re-read from the database, so changes take effect on the next request.
export function signSession(userId) {
  return jwt.sign({}, secret(), { subject: String(userId), expiresIn: SESSION_TTL_SECONDS, algorithm: "HS256" });
}

// Throws jsonwebtoken's TokenExpiredError / JsonWebTokenError on bad tokens.
export function verifySession(token) {
  return jwt.verify(token, secret(), { algorithms: ["HS256"] });
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // "lax" works while client and API share a site (localhost, or app. and api.
    // subdomains). A different-site deployment needs "none" plus CSRF protection.
    sameSite: process.env.COOKIE_SAMESITE || "lax",
    path: "/",
  };
}

export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_TTL_SECONDS * 1000 });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}
