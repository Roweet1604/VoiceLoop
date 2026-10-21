// Runs before each test file. Connects Mongoose to a dedicated test database
// and empties it between tests.
//
// MONGODB_TEST_URI is used if set. Otherwise the test suite reuses the
// cluster from MONGODB_URI but switches to a database named "voiceloop_test".
// Either way, it refuses to run against a database whose name does not end in
// "_test", so a misconfiguration can never wipe real data.
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { rm, mkdir } from "node:fs/promises";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { beforeAll, beforeEach, afterAll } from "vitest";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

process.env.NODE_ENV = "test";
// A fixed secret for tests only, independent of the real one in .env.
process.env.JWT_SECRET = "test-only-secret-that-is-long-enough-for-hs256-signing";
// Audio goes to a fresh temporary folder per test file, never the real one.
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_DIR = mkdtempSync(path.join(os.tmpdir(), "voiceloop-storage-test-"));
process.env.TRANSCRIPTION_PROVIDER = "none";

const TEST_DB_NAME = "voiceloop_test";

beforeAll(async () => {
  const uri = process.env.MONGODB_TEST_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error("Set MONGODB_TEST_URI (or MONGODB_URI) in server/.env to run the tests");

  await mongoose.connect(uri, process.env.MONGODB_TEST_URI ? {} : { dbName: TEST_DB_NAME });

  const dbName = mongoose.connection.name;
  if (!dbName.endsWith("_test")) {
    await mongoose.disconnect();
    throw new Error(`Refusing to run tests against database "${dbName}": its name must end in "_test"`);
  }

  // Build indexes (e.g. the unique email index) before tests rely on them.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
});

async function clearDatabase() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

async function clearStorage() {
  await rm(process.env.STORAGE_LOCAL_DIR, { recursive: true, force: true });
  await mkdir(process.env.STORAGE_LOCAL_DIR, { recursive: true });
}

beforeEach(async () => {
  await Promise.all([clearDatabase(), clearStorage()]);
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await clearDatabase();
    await mongoose.disconnect();
  }
  await rm(process.env.STORAGE_LOCAL_DIR, { recursive: true, force: true });
});
