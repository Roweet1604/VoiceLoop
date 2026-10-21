import "dotenv/config";
import { createApp } from "./app.js";
import { connectDB } from "./config/db.js";
import { assertSessionConfig } from "./utils/session.js";
import { getStorage } from "./services/storage/index.js";
import { getTranscriber } from "./services/transcription/index.js";
import { getEmailSender, emailStatus } from "./services/email/index.js";

const PORT = process.env.PORT || 5000;

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

const app = createApp();

connectDB(process.env.MONGODB_URI)
  .catch((err) => console.error("MongoDB connection failed:", err.message))
  .finally(() => {
    app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
  });
