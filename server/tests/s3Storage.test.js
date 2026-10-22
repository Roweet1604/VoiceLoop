import { describe, it, expect, vi } from "vitest";
import { Readable } from "node:stream";
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createS3Storage, s3ClientConfig, S3_ENV_VARS } from "../src/services/storage/s3.js";
import { StorageNotFoundError, StorageNotConfiguredError } from "../src/services/storage/errors.js";

// Cloudflare R2-style settings. The S3 client is replaced by a fake, so no
// request ever leaves the machine.
const ENV = {
  STORAGE_DRIVER: "s3",
  S3_ENDPOINT: "https://account.r2.cloudflarestorage.com",
  S3_BUCKET: "voiceloop-audio",
  S3_REGION: "auto",
  S3_ACCESS_KEY_ID: "AKIDEXAMPLE",
  S3_SECRET_ACCESS_KEY: "super-secret-value-that-must-not-leak",
};
const KEY = `${"a".repeat(24)}/${"b".repeat(32)}.webm`;

function fakeClient(handler = async () => ({})) {
  return { send: vi.fn(handler) };
}

const notFound = () => Object.assign(new Error("The specified key does not exist."), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });

describe("S3 storage driver", () => {
  it("stores an object in the bucket under its key", async () => {
    const client = fakeClient();
    const storage = createS3Storage(ENV, { client });
    const data = Buffer.from("audio bytes");

    await storage.put(KEY, data);

    expect(client.send).toHaveBeenCalledTimes(1);
    const command = client.send.mock.calls[0][0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: "voiceloop-audio",
      Key: KEY,
      Body: data,
      ContentLength: data.length,
      ContentType: "audio/webm",
    });
  });

  it("streams an object back with its size", async () => {
    const body = Readable.from([Buffer.from("hello")]);
    const client = fakeClient(async () => ({ Body: body, ContentLength: 5 }));
    const storage = createS3Storage(ENV, { client });

    const { stream, sizeBytes } = await storage.getStream(KEY);

    expect(sizeBytes).toBe(5);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString()).toBe("hello");
    const command = client.send.mock.calls[0][0];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({ Bucket: "voiceloop-audio", Key: KEY });
  });

  it("reports a missing object as StorageNotFoundError, without the key in the message", async () => {
    const storage = createS3Storage(ENV, { client: fakeClient(async () => { throw notFound(); }) });
    const error = await storage.getStream(KEY).catch((err) => err);
    expect(error).toBeInstanceOf(StorageNotFoundError);
    expect(error.message).not.toContain(KEY);
  });

  it("passes other errors through", async () => {
    const storage = createS3Storage(ENV, { client: fakeClient(async () => { throw new Error("AccessDenied"); }) });
    await expect(storage.getStream(KEY)).rejects.toThrow("AccessDenied");
    await expect(storage.delete(KEY)).rejects.toThrow("AccessDenied");
  });

  it("deletes an object, and treats a missing one as already deleted", async () => {
    const client = fakeClient();
    const storage = createS3Storage(ENV, { client });
    await storage.delete(KEY);
    const command = client.send.mock.calls[0][0];
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toEqual({ Bucket: "voiceloop-audio", Key: KEY });

    const missing = createS3Storage(ENV, { client: fakeClient(async () => { throw notFound(); }) });
    await expect(missing.delete(KEY)).resolves.toBeUndefined();
  });

  it("refuses bad keys before contacting the provider", async () => {
    const client = fakeClient();
    const storage = createS3Storage(ENV, { client });
    for (const bad of ["../x.webm", "a/../../b.webm", "/etc/passwd", `${"a".repeat(24)}/${"b".repeat(32)}.exe`, 42]) {
      await expect(storage.put(bad, Buffer.from("x")), String(bad)).rejects.toThrow("Invalid storage key");
      await expect(storage.getStream(bad), String(bad)).rejects.toThrow("Invalid storage key");
      await expect(storage.delete(bad), String(bad)).rejects.toThrow("Invalid storage key");
    }
    expect(client.send).not.toHaveBeenCalled();
  });

  it("refuses to start without its settings, naming what is missing but never a value", () => {
    for (const name of S3_ENV_VARS) {
      const env = { ...ENV, [name]: "" };
      const error = (() => {
        try {
          createS3Storage(env);
        } catch (err) {
          return err;
        }
      })();
      expect(error, name).toBeInstanceOf(StorageNotConfiguredError);
      expect(error.message).toContain(name);
      expect(error.message).not.toContain(ENV.S3_SECRET_ACCESS_KEY);
      expect(error.message).not.toContain(ENV.S3_ACCESS_KEY_ID);
    }
    expect(() => createS3Storage({ STORAGE_DRIVER: "s3" })).toThrow(/S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY are not set/);
  });

  it("configures the client for R2: custom endpoint, region auto, path-style", () => {
    expect(s3ClientConfig(ENV)).toEqual({
      region: "auto",
      endpoint: "https://account.r2.cloudflarestorage.com",
      forcePathStyle: true,
      credentials: { accessKeyId: "AKIDEXAMPLE", secretAccessKey: ENV.S3_SECRET_ACCESS_KEY },
    });
    // AWS S3: no endpoint, virtual-hosted style; both can be overridden.
    const aws = { ...ENV, S3_ENDPOINT: "", S3_REGION: "eu-west-1" };
    expect(s3ClientConfig(aws)).toMatchObject({ region: "eu-west-1", endpoint: undefined, forcePathStyle: false });
    expect(s3ClientConfig({ ...ENV, S3_FORCE_PATH_STYLE: "false" }).forcePathStyle).toBe(false);
    // A real client is built from it without any request being made.
    expect(createS3Storage(ENV)).toMatchObject({ name: "s3", bucket: "voiceloop-audio" });
  });
});
