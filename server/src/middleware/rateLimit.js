import rateLimit from "express-rate-limit";

// All limiters answer with the standard error shape.
// `keyGenerator` is optional (default: per IP).
export function createLimiter({ windowMs, limit, keyGenerator }) {
  return rateLimit({
    windowMs,
    limit,
    ...(keyGenerator && { keyGenerator }),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { message: "Too many requests, please try again later", code: "RATE_LIMITED" } },
  });
}
