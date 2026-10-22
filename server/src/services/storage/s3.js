// S3-compatible driver: AWS S3, Cloudflare R2, Backblaze B2 and others.
//
// Settings (STORAGE_DRIVER=s3):
//   S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY   required
//   S3_ENDPOINT          the provider's API address. Leave empty for AWS S3;
//                        needed for R2 (https://<account id>.r2.cloudflarestorage.com)
//                        and B2. With R2, S3_REGION is "auto".
//   S3_FORCE_PATH_STYLE  "true"/"false"; defaults to true when S3_ENDPOINT is set
//                        (bucket in the path, which every S3-compatible API accepts)
//
// Missing settings stop the server at startup with the names of what's
// missing; values (and so the secret key) are never logged or put in errors.
// The bucket must be private: objects are only read back through
// GET /api/feedback/:id/audio after the ownership check, never by URL.
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { assertStorageKey } from "./keys.js";
import { StorageNotConfiguredError, StorageNotFoundError } from "./errors.js";

export const S3_ENV_VARS = ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"];

// Stored with each object, so the provider's console shows sensible types.
const CONTENT_TYPES = {
  webm: "audio/webm",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

const isNotFound = (err) =>
  err?.name === "NoSuchKey" || err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404;

// The S3Client settings for this environment (also used by the tests).
export function s3ClientConfig(env) {
  const endpoint = env.S3_ENDPOINT || undefined;
  return {
    region: env.S3_REGION,
    endpoint,
    forcePathStyle: env.S3_FORCE_PATH_STYLE ? env.S3_FORCE_PATH_STYLE === "true" : Boolean(endpoint),
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  };
}

// `client` lets tests pass a fake with a `send(command)` method.
export function createS3Storage(env = process.env, { client } = {}) {
  const missing = S3_ENV_VARS.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new StorageNotConfiguredError(
      `STORAGE_DRIVER is "s3" but ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not set`
    );
  }

  const bucket = env.S3_BUCKET;
  const s3 = client ?? new S3Client(s3ClientConfig(env));

  return {
    name: "s3",
    bucket,

    // Keys contain 128 random bits, so a new object never lands on an existing
    // key; the local driver additionally refuses to overwrite.
    async put(key, data) {
      assertStorageKey(key);
      const extension = key.slice(key.lastIndexOf(".") + 1);
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: data,
          ContentLength: data.length,
          ContentType: CONTENT_TYPES[extension],
        })
      );
    },

    async getStream(key) {
      assertStorageKey(key);
      try {
        const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return { stream: result.Body, sizeBytes: result.ContentLength };
      } catch (err) {
        if (isNotFound(err)) throw new StorageNotFoundError(key);
        throw err;
      }
    },

    // Deleting a missing object is not an error (S3 itself answers 204).
    async delete(key) {
      assertStorageKey(key);
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } catch (err) {
        if (!isNotFound(err)) throw err;
      }
    },
  };
}
