// Runs automatic deletion once: deletes feedback (and its recordings) older
// than RETENTION_DAYS. The server does the same at startup and every hour.
//
//   cd server
//   node scripts/run-retention.js --dry-run   # only counts, deletes nothing
//   node scripts/run-retention.js
//
// Uses MONGODB_URI, RETENTION_DAYS and the storage settings from server/.env.
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { retentionDaysFrom, runRetention } from "../src/services/retention.js";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

if (!process.env.MONGODB_URI) {
  console.error("Error: MONGODB_URI is not set in server/.env");
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");
const days = retentionDaysFrom();

await mongoose.connect(process.env.MONGODB_URI);
try {
  const result = await runRetention({ days, dryRun });
  const where = `in "${mongoose.connection.name}" submitted before ${result.cutoff.toISOString()} (${days} days)`;
  if (dryRun) {
    console.log(`Dry run: would delete ${result.feedback} feedback item(s) and ${result.audioFiles} audio file(s) ${where}. Nothing was deleted.`);
  } else {
    const failed = result.failedFiles ? `; ${result.failedFiles} file(s) could not be removed (see the log above)` : "";
    console.log(`Deleted ${result.feedback} feedback item(s) and ${result.audioFiles} audio file(s) ${where}${failed}.`);
  }
} finally {
  await mongoose.disconnect();
}
