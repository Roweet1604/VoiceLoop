// Removes the landing-card title and button fields that businesses could set
// in Phase 3D (they are now fixed in the client). Only these four fields are
// unset; no other data is touched. Safe to run repeatedly.
//
//   cd server
//   node scripts/unset-removed-wording-fields.js
//
// Uses MONGODB_URI from server/.env. The app already ignores these fields
// (they're no longer in the schema or any response); this just cleans them up.
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { Business } from "../src/models/Business.js";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

const REMOVED_FIELDS =["reviewCardTitle", "reviewCardButton", "feedbackCardTitle", "feedbackCardButton"];

if (!process.env.MONGODB_URI) {
  console.error("Error: MONGODB_URI is not set in server/.env");
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);
try {
  // Raw collection access: the fields aren't in the schema any more, so
  // Mongoose's strict mode would drop them from the update.
  const { matchedCount, modifiedCount } = await Business.collection.updateMany(
    { $or: REMOVED_FIELDS.map((field) => ({ [field]: { $exists: true } })) },
    { $unset: Object.fromEntries(REMOVED_FIELDS.map((field) => [field, ""])) }
  );
  console.log(
    `Database "${mongoose.connection.name}": ${matchedCount} businesses had removed fields; ${modifiedCount} cleaned.`
  );
} finally {
  await mongoose.disconnect();
}
