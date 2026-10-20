import rateLimit from "express-rate-limit";

// All limiters answer with the standard error shape.
export function createLimiter({ windowMs, limit }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { message: "Too many requests, please try again later", code: "RATE_LIMITED" } },
  });
}
