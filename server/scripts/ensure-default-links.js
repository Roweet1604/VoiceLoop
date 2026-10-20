// Creates the default "Main link" for every business that doesn't have one
// (businesses created before feedback links existed). Safe to run repeatedly.
//
//   cd server
//   node scripts/ensure-default-links.js
//
// Uses MONGODB_URI from server/.env.
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { Business } from "../src/models/Business.js";
import { FeedbackLink } from "../src/models/FeedbackLink.js";
import { ensureDefaultLink } from "../src/services/feedbackLinks.js";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

if (!process.env.MONGODB_URI) {
  console.error("Error: MONGODB_URI is not set in server/.env");
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);
try {
  // The partial unique index must exist before ensureDefaultLink relies on it.
  await FeedbackLink.init();

  let created = 0;
  let checked = 0;
  for await (const business of Business.find().cursor()) {
    checked++;
    const hadDefault = await FeedbackLink.exists({ businessId: business._id, isDefault: true });
    if (!hadDefault) {
      await ensureDefaultLink(business);
      created++;
    }
  }
  console.log(`Checked ${checked} businesses in "${mongoose.connection.name}"; created ${created} default links.`);
} finally {
  await mongoose.disconnect();
}
