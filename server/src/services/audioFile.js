// Checks an uploaded recording before it is stored. The declared type comes
// from the browser and can't be trusted, so the file's first bytes (its
// "magic bytes") must match the declared format too.
import { AppError } from "../utils/AppError.js";

export const AUDIO_MAX_BYTES = 5 * 1024 * 1024;
export const AUDIO_MAX_DURATION_SEC = 120;
// Smaller than any real recording's container header plus a moment of sound.
const AUDIO_MIN_BYTES = 100;
// Well above uncompressed 48 kHz 24-bit stereo (288 kB/s). A file denser than
// this can't be as short as the client claims.
const MAX_BYTES_PER_SECOND = 400_000;

const ascii = (buffer, start, end) => buffer.subarray(start, end).toString("latin1");

// Allowed types, their stored extension, and how to recognise them.
export const AUDIO_FORMATS = {
  // EBML header, with "webm" as the document type (Matroska shares the header).
  "audio/webm": {
    extension: "webm",
    matches: (b) => b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 && ascii(b, 0, 64).includes("webm"),
  },
  "audio/ogg": { extension: "ogg", matches: (b) => ascii(b, 0, 4) === "OggS" },
  // ISO base media file: a box size, then "ftyp".
  "audio/mp4": { extension: "m4a", matches: (b) => b.length >= 12 && ascii(b, 4, 8) === "ftyp" },
  // An ID3 tag, or straight into an MPEG audio frame (11 sync bits set).
  "audio/mpeg": {
    extension: "mp3",
    matches: (b) => ascii(b, 0, 3) === "ID3" || (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  },
  "audio/wav": { extension: "wav", matches: (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WAVE" },
};
export const AUDIO_MIME_TYPES = Object.keys(AUDIO_FORMATS);

// "audio/webm;codecs=opus" -> "audio/webm". Common aliases map to one name.
const ALIASES = { "audio/x-wav": "audio/wav", "audio/wave": "audio/wav", "audio/mp3": "audio/mpeg", "audio/x-m4a": "audio/mp4" };
export function baseMimeType(mimeType) {
  const base = String(mimeType ?? "").split(";")[0].trim().toLowerCase();
  return ALIASES[base] ?? base;
}

const invalid = (message) => AppError.badRequest("Validation failed", { audio: message });

/**
 * Returns { mimeType, extension, sizeBytes } for an acceptable recording, or
 * throws a 400 with details.audio. `durationSec` is the already validated,
 * client-reported duration; it is checked against the file size.
 */
export function inspectAudio(file, durationSec) {
  if (!file?.buffer) throw invalid("Record a voice message first");

  const mimeType = baseMimeType(file.mimetype);
  const format = AUDIO_FORMATS[mimeType];
  if (!format) throw invalid("This audio format isn't supported");

  const sizeBytes = file.buffer.length;
  if (sizeBytes > AUDIO_MAX_BYTES) throw invalid("The recording is too large");
  if (sizeBytes < AUDIO_MIN_BYTES) throw invalid("The recording is empty");
  if (!format.matches(file.buffer)) throw invalid("The file isn't a valid recording");
  if (sizeBytes / durationSec > MAX_BYTES_PER_SECOND) throw invalid("The recording's length doesn't match its size");

  return { mimeType, extension: format.extension, sizeBytes };
}
