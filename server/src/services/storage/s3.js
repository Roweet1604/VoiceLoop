// S3-compatible driver (AWS S3, Cloudflare R2, Backblaze B2, ...): NOT
// IMPLEMENTED YET. It only checks that its settings are present, so choosing
// STORAGE_DRIVER=s3 without them fails at startup instead of losing uploads.
// Even when configured, every operation throws until a real client is added.
import { StorageNotConfiguredError } from "./errors.js";

export const S3_ENV_VARS = ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"];

export function createS3Storage(env = process.env) {
  const missing = S3_ENV_VARS.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new StorageNotConfiguredError(`S3 storage is not configured (missing ${missing.join(", ")})`);
  }

  const notImplemented = async () => {
    throw new StorageNotConfiguredError("S3 storage is not implemented yet; use STORAGE_DRIVER=local");
  };
  return { name: "s3", put: notImplemented, getStream: notImplemented, delete: notImplemented };
}
