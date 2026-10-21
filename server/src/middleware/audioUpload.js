import multer from "multer";
import { AppError } from "../utils/AppError.js";
import { AUDIO_MAX_BYTES, AUDIO_MIME_TYPES, baseMimeType } from "../services/audioFile.js";

// Parses a multipart voice submission: one file in the "audio" field, held in
// memory (at most 5 MB) and never written anywhere until it has been checked.
// Text fields are small and few; anything beyond these limits is rejected.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AUDIO_MAX_BYTES, files: 1, fields: 10, fieldSize: 1024, parts: 11 },
  // A first, cheap check on the declared type. The real content is verified
  // afterwards by inspectAudio().
  fileFilter(req, file, cb) {
    if (AUDIO_MIME_TYPES.includes(baseMimeType(file.mimetype))) return cb(null, true);
    cb(AppError.badRequest("Validation failed", { audio: "This audio format isn't supported" }));
  },
}).single("audio");

function toAppError(err) {
  if (err instanceof AppError) return err;
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return new AppError("The recording is too large", 413, "PAYLOAD_TOO_LARGE", { audio: "The recording is too large" });
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE" || err.code === "LIMIT_FILE_COUNT") {
      return AppError.badRequest("Validation failed", { audio: "Send exactly one recording" });
    }
    return AppError.badRequest("The upload couldn't be read");
  }
  // Malformed multipart bodies come from busboy as plain errors.
  return AppError.badRequest("The upload couldn't be read");
}

export function receiveAudio(req, res, next) {
  upload(req, res, (err) => next(err ? toAppError(err) : undefined));
}
