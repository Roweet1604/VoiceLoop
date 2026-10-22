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
import inboxRouter from "./routes/inbox.js";
import { createExportRouter } from "./routes/export.js";
import analyticsRouter from "./routes/analytics.js";
import { createPublicRouter } from "./routes/public.js";
import { clientAppRouter, clientContentSecurityPolicy } from "./config/clientApp.js";
import { trustProxySetting } from "./config/startupChecks.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

const ONE_MINUTE = 60 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;
const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

// Builds the Express app without starting a server, so tests can drive it
// with Supertest. `limits` lets tests loosen or tighten the rate limiters and
// the export row cap (limits.exportRows).
//
// `clientApp` (from loadClientApp, production only) also serves the built
// React app from this server; without it the server is API-only, as in
// development. `trustProxy` is Express's "trust proxy" setting (TRUST_PROXY):
// behind a host's proxy it makes rate limits see each visitor's own address.
export function createApp({ limits = {}, clientApp = null, trustProxy = trustProxySetting(process.env.TRUST_PROXY) } = {}) {
  const app = express();
  app.set("trust proxy", trustProxy);

  app.use(clientApp ? helmet({ contentSecurityPolicy: clientContentSecurityPolicy(helmet, clientApp) }) : helmet());
  // credentials: true lets the browser send the session cookie cross-origin.
  // The exposed headers let the client read the export's file name and
  // whether it was cut off when the API is on another origin.
  app.use(
    cors({
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      credentials: true,
      exposedHeaders: ["Content-Disposition", "X-Export-Total", "X-Export-Rows", "X-Export-Truncated", "X-Export-Row-Limit"],
    })
  );

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
      // Per IP. Each account is also limited to 3 links per hour
      // (services/passwordReset.js).
      forgotLimiter: createLimiter({ windowMs: ONE_HOUR, limit: limits.forgot ?? 5 }),
      resetLimiter: createLimiter({ windowMs: FIFTEEN_MINUTES, limit: limits.reset ?? 10 }),
    })
  );
  app.use("/api/super-admin", superAdminRouter);
  app.use("/api/business", businessRouter);
  app.use("/api/links", linksRouter);
  // Before the inbox, so "export.csv" isn't read as a feedback id. Exports
  // are heavier than other reads, so they have their own limit.
  app.use(
    "/api/feedback/export.csv",
    createLimiter({ windowMs: FIFTEEN_MINUTES, limit: limits.export ?? 30 }),
    createExportRouter({ rowLimit: limits.exportRows })
  );
  app.use("/api/feedback", inboxRouter);
  app.use("/api/analytics", analyticsRouter);
  // Public endpoints get their own, tighter per-IP limit on top of the API-wide
  // one, feedback submission a much stricter one again, and voice uploads
  // (up to 5 MB each) the strictest.
  app.use(
    "/api/public",
    createLimiter({ windowMs: ONE_MINUTE, limit: limits.public ?? 60 }),
    createPublicRouter({
      submitLimiter: createLimiter({ windowMs: TEN_MINUTES, limit: limits.submit ?? 10 }),
      voiceLimiter: createLimiter({ windowMs: TEN_MINUTES, limit: limits.voice ?? 5 }),
    })
  );

  // The React app for every other page (/, /f/<slug>, /app/...), after the API.
  if (clientApp) app.use(clientAppRouter(clientApp));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
