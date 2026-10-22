import "dotenv/config";
import { createApp } from "./app.js";
import { connectDB } from "./config/db.js";
import { checkStartupConfig } from "./config/startupChecks.js";
import { loadClientApp } from "./config/clientApp.js";
import { assertSessionConfig } from "./utils/session.js";
import { getStorage } from "./services/storage/index.js";
import { getTranscriber } from "./services/transcription/index.js";
import { getEmailSender, emailStatus } from "./services/email/index.js";
import { retentionDaysFrom, startRetentionSchedule } from "./services/retention.js";

const PORT = process.env.PORT || 5000;
const production = process.env.NODE_ENV === "production";

// In production, refuse to start without the essential settings, and say
// which ones are missing.
const { errors, warnings } = checkStartupConfig();
for (const warning of warnings) console.warn(`[config] Warning: ${warning}`);
if (errors.length > 0) {
  for (const error of errors) console.error(`[config] ${error}`);
  console.error("[config] Not starting: fix the settings above in the host's environment variables.");
  process.exit(1);
}

// Refuse to start with a missing or weak JWT secret rather than issuing
// sessions that could be forged.
assertSessionConfig();
// Likewise for an unknown or unconfigured storage driver or transcription
// provider: fail now, not on a customer's first upload.
const storage = getStorage();
const transcriber = getTranscriber();
console.log(`Audio storage: ${storage.name}. Transcription: ${transcriber.isAvailable() ? transcriber.name : "unavailable (no provider)"}`);
// Email can't stop the rest of the app from working, so a bad setup is a
// loud error rather than a refusal to start. Unknown providers do throw.
getEmailSender();
const email = emailStatus();
(email.ok ? console.log : console.error)(`Email: ${email.message}`);

// A bad RETENTION_DAYS could delete feedback early: refuse to start.
console.log(`Retention: feedback is deleted automatically after ${retentionDaysFrom()} days`);

// Production serves the built client from this server too (one service,
// one address). Development uses the Vite dev server for that.
const clientApp = production ? loadClientApp(process.env.CLIENT_DIST_DIR || undefined) : null;
if (production) {
  console.log(
    clientApp
      ? `Client: serving the built app from ${clientApp.root}`
      : "[config] Warning: no built client found (client/dist/index.html). Run `npm run build` in the project folder; serving the API only."
  );
}

const app = createApp({ clientApp });

connectDB(process.env.MONGODB_URI)
  .catch((err) => console.error("MongoDB connection failed:", err.message))
  .finally(() => {
    app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
    // Not awaited: the first run happens in the background.
    startRetentionSchedule();
  });
