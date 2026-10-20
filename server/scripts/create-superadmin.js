// Creates the Super Admin account. This is the only way to create one: no API
// route assigns the "superadmin" role.
//
//   cd server
//   node scripts/create-superadmin.js --email admin@example.com --password "<strong password>" [--name "Ops Admin"]
//
// Uses MONGODB_URI from server/.env. Refuses to modify an existing account.
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { User } from "../src/models/User.js";
import { checkEmail, checkNewPassword } from "../src/validators/auth.js";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    password: { type: "string" },
    name: { type: "string", default: "Super Admin" },
  },
});

const problem = checkEmail(values.email) || checkNewPassword(values.password);
if (problem) fail(`${problem}. Usage: node scripts/create-superadmin.js --email <email> --password <password> [--name <name>]`);
if (!process.env.MONGODB_URI) fail("MONGODB_URI is not set in server/.env");

const email = values.email.trim().toLowerCase();

await mongoose.connect(process.env.MONGODB_URI);
try {
  if (await User.exists({ email })) {
    fail(`an account with ${email} already exists; nothing was changed`);
  }
  const admin = await User.create({
    name: values.name.trim(),
    email,
    passwordHash: await bcrypt.hash(values.password, 12),
    role: "superadmin",
    organizationId: null,
  });
  console.log(`Super Admin created: ${admin.email} (id ${admin._id}) in database "${mongoose.connection.name}"`);
} finally {
  await mongoose.disconnect();
}
