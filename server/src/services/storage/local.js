// Development driver: files on the local disk, in a private folder that no
// route serves statically. Audio is only ever read back through
// GET /api/feedback/:id/audio, after the ownership check.
import path from "node:path";
import { createReadStream } from "node:fs";
import { mkdir, writeFile, stat, rm } from "node:fs/promises";
import { assertStorageKey } from "./keys.js";
import { StorageNotFoundError } from "./errors.js";

export function createLocalStorage({ root }) {
  const absoluteRoot = path.resolve(root);

  // Keys are validated against a strict pattern, so they can't contain "..",
  // backslashes or absolute paths; the prefix check is a second guard.
  function fileFor(key) {
    assertStorageKey(key);
    const file = path.resolve(absoluteRoot, ...key.split("/"));
    if (!file.startsWith(absoluteRoot + path.sep)) throw new Error("Invalid storage key");
    return file;
  }

  return {
    name: "local",
    root: absoluteRoot,

    async put(key, data) {
      const file = fileFor(key);
      await mkdir(path.dirname(file), { recursive: true });
      // "wx": never overwrite an existing object.
      await writeFile(file, data, { flag: "wx" });
    },

    async getStream(key) {
      const file = fileFor(key);
      try {
        const info = await stat(file);
        return { stream: createReadStream(file), sizeBytes: info.size };
      } catch (err) {
        if (err.code === "ENOENT") throw new StorageNotFoundError(key);
        throw err;
      }
    },

    // Deleting a missing object is not an error.
    async delete(key) {
      await rm(fileFor(key), { force: true });
    },
  };
}
