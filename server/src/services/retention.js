// Automatic deletion of old feedback.
//
// Every Feedback document submitted more than RETENTION_DAYS ago is deleted,
// whatever its review or complaint status and notes, together with its audio
// file. Nothing newer than the cutoff and no other collection is touched.
// Runs at startup and every hour (startRetentionSchedule), and by hand with
// scripts/run-retention.js.
import { Feedback } from "../models/Feedback.js";
import { AuditLog } from "../models/AuditLog.js";
import { deleteStoredFiles } from "./accountDeletion.js";

export const DEFAULT_RETENTION_DAYS = 45;
const MAX_RETENTION_DAYS = 3650;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
export const RETENTION_BATCH_SIZE = 200;

// RETENTION_DAYS as a whole number from 1 to 3650, or the default when unset.
// Throws on anything else, so a typo can't silently delete too much.
export function retentionDaysFrom(env = process.env) {
  const raw = env.RETENTION_DAYS?.trim();
  if (!raw) return DEFAULT_RETENTION_DAYS;
  const days = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!(days >= 1 && days <= MAX_RETENTION_DAYS)) {
    throw new Error(`RETENTION_DAYS must be a whole number from 1 to ${MAX_RETENTION_DAYS} (got "${env.RETENTION_DAYS}")`);
  }
  return days;
}

export const retentionCutoff = (days, now = new Date()) => new Date(now.getTime() - days * DAY_MS);

let running = false;

/**
 * Deletes feedback older than the cutoff, in batches. Each batch's records
 * are deleted first and its audio files afterwards; a file that can't be
 * removed is logged by key (deleteStoredFiles) and the run continues.
 *
 * Returns { cutoff, feedback, audioFiles, failedFiles }, or { skipped: true }
 * if a run is already in progress in this process. With dryRun, only counts
 * what would be deleted.
 */
export async function runRetention({
  days = retentionDaysFrom(),
  now = new Date(),
  batchSize = RETENTION_BATCH_SIZE,
  dryRun = false,
} = {}) {
  const cutoff = retentionCutoff(days, now);
  const expired = { submittedAt: { $lt: cutoff } };

  if (dryRun) {
    const [feedback, audioFiles] = await Promise.all([
      Feedback.countDocuments(expired),
      Feedback.countDocuments({ ...expired, audioKey: { $ne: null } }),
    ]);
    return { cutoff, feedback, audioFiles, dryRun: true };
  }

  if (running) return { skipped: true };
  running = true;
  try {
    const totals = { cutoff, feedback: 0, audioFiles: 0, failedFiles: 0 };
    for (;;) {
      const batch = await Feedback.find(expired).sort({ _id: 1 }).limit(batchSize).select("_id audioKey").lean();
      if (batch.length === 0) break;

      // The cutoff is repeated so nothing newer can ever match.
      const { deletedCount } = await Feedback.deleteMany({ _id: { $in: batch.map((f) => f._id) }, ...expired });
      // Another process got there first; its run deletes the files.
      if (deletedCount === 0) break;
      totals.feedback += deletedCount;

      const keys = batch.map((f) => f.audioKey).filter(Boolean);
      if (keys.length > 0) {
        const files = await deleteStoredFiles(keys, "expired feedback deleted");
        totals.audioFiles += files.removed;
        totals.failedFiles += files.failed;
      }
      if (batch.length < batchSize) break;
    }

    if (totals.feedback > 0) {
      // Counts and the cutoff only: no ids, customer text or emails.
      await AuditLog.create({
        action: "retention.cleanup",
        targetType: "Platform",
        context: { feedbackDeleted: totals.feedback, audioFilesDeleted: totals.audioFiles, cutoff },
      });
    }
    return totals;
  } finally {
    running = false;
  }
}

// Runs now and then every hour, without delaying startup. Errors are logged,
// never thrown. The timer is unref'd so it never keeps the process alive.
// Returns { timer, firstRun } (firstRun settles when the first run ends).
export function startRetentionSchedule({ intervalMs = HOUR_MS } = {}) {
  const tick = () =>
    runRetention()
      .then((result) => {
        if (result.feedback > 0) {
          console.log(
            `[retention] deleted ${result.feedback} feedback item(s) and ${result.audioFiles} audio file(s) submitted before ${result.cutoff.toISOString()}`
          );
        }
      })
      .catch((err) => console.error("[retention] run failed:", err.message));
  const firstRun = tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return { timer, firstRun };
}
