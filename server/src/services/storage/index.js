// Private object storage for audio. Every driver implements:
//
//   put(key, buffer)   stores a new object (never overwrites)
//   getStream(key)     -> { stream, sizeBytes }; StorageNotFoundError if missing
//   delete(key)        removes the object; missing objects are not an error
//
// STORAGE_DRIVER picks the driver: "local" (default) or "s3" (stub, see s3.js).
// Only storage keys go into MongoDB, never the audio itself.
import { fileURLToPath } from "node:url";
import { createLocalStorage } from "./local.js";
import { createS3Storage } from "./s3.js";

export { newAudioKey } from "./keys.js";
export { StorageNotFoundError, StorageNotConfiguredError } from "./errors.js";

// server/private-storage: outside src/ and any static path, and gitignored.
const DEFAULT_LOCAL_DIR = fileURLToPath(new URL("../../../private-storage", import.meta.url));

let storage = null;

export function createStorage(env = process.env) {
  const driver = env.STORAGE_DRIVER || "local";
  if (driver === "local") return createLocalStorage({ root: env.STORAGE_LOCAL_DIR || DEFAULT_LOCAL_DIR });
  if (driver === "s3") return createS3Storage(env);
  throw new Error(`Unknown STORAGE_DRIVER "${driver}" (use "local" or "s3")`);
}

// The configured driver, created on first use.
export function getStorage() {
  storage ??= createStorage();
  return storage;
}
