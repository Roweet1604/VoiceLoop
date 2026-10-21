import crypto from "node:crypto";

// Storage keys look like <businessId>/<32 random hex chars>.<ext>. The random
// part makes keys unguessable; they are never sent to any client anyway.
export const AUDIO_EXTENSIONS = ["webm", "ogg", "m4a", "mp3", "wav"];
export const STORAGE_KEY_PATTERN = new RegExp(`^[a-f0-9]{24}/[a-f0-9]{32}\\.(${AUDIO_EXTENSIONS.join("|")})$`);

export function newAudioKey(businessId, extension) {
  if (!AUDIO_EXTENSIONS.includes(extension)) throw new Error(`Unsupported audio extension: ${extension}`);
  const key = `${String(businessId)}/${crypto.randomBytes(16).toString("hex")}.${extension}`;
  if (!STORAGE_KEY_PATTERN.test(key)) throw new Error("Invalid business id for a storage key");
  return key;
}

export function assertStorageKey(key) {
  if (typeof key !== "string" || !STORAGE_KEY_PATTERN.test(key)) throw new Error("Invalid storage key");
}
