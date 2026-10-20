import "dotenv/config";
import { createApp } from "./app.js";
import { connectDB } from "./config/db.js";
import { assertSessionConfig } from "./utils/session.js";

const PORT = process.env.PORT || 5000;

// Refuse to start with a missing or weak JWT secret rather than issuing
// sessions that could be forged.
assertSessionConfig();

const app = createApp();

connectDB(process.env.MONGODB_URI)
  .catch((err) => console.error("MongoDB connection failed:", err.message))
  .finally(() => {
    app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
  });
