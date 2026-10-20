import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { createLimiter } from "./middleware/rateLimit.js";
import healthRouter from "./routes/health.js";
import { createAuthRouter } from "./routes/auth.js";
import superAdminRouter from "./routes/superAdmin.js";
import businessRouter from "./routes/business.js";
import linksRouter from "./routes/links.js";
import { createPublicRouter } from "./routes/public.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

const ONE_MINUTE = 60 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;
const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

// Builds the Express app without starting a server, so tests can drive it
// with Supertest. `limits` lets tests loosen or tighten the rate limiters.
export function createApp({ limits = {} } = {}) {
  const app = express();

  app.use(helmet());
  // credentials: true lets the browser send the session cookie cross-origin.
  app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true }));

  // Rate limit before parsing bodies so malformed or oversized payloads still count.
  app.use("/api", createLimiter({ windowMs: FIFTEEN_MINUTES, limit: limits.api ?? 300 }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.use("/api/health", healthRouter);
  app.use(
    "/api/auth",
    createAuthRouter({
      loginLimiter: createLimiter({ windowMs: FIFTEEN_MINUTES, limit: limits.login ?? 10 }),
      registerLimiter: createLimiter({ windowMs: ONE_HOUR, limit: limits.register ?? 5 }),
    })
  );
  app.use("/api/super-admin", superAdminRouter);
  app.use("/api/business", businessRouter);
  app.use("/api/links", linksRouter);
  // Public endpoints get their own, tighter per-IP limit on top of the API-wide
  // one, and feedback submission a much stricter one again.
  app.use(
    "/api/public",
    createLimiter({ windowMs: ONE_MINUTE, limit: limits.public ?? 60 }),
    createPublicRouter({
      submitLimiter: createLimiter({ windowMs: TEN_MINUTES, limit: limits.submit ?? 10 }),
    })
  );

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
