import { AppError } from "../utils/AppError.js";

const isProduction = process.env.NODE_ENV === "production";

// Errors raised by Express's body parser carry a `type` we can map to a
// client error instead of a generic 500.
const BODY_PARSER_ERRORS = {
  "entity.too.large": { statusCode: 413, code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" },
  "entity.parse.failed": { statusCode: 400, code: "INVALID_JSON", message: "Request body is not valid JSON" },
};

function normalize(err) {
  if (err instanceof AppError) return err;

  const parserError = BODY_PARSER_ERRORS[err.type];
  if (parserError) {
    return new AppError(parserError.message, parserError.statusCode, parserError.code);
  }

  // Unknown error: never leak its message (which may contain paths or query
  // details) in production.
  return new AppError(
    isProduction ? "Internal server error" : err.message || "Internal server error",
    500,
    "INTERNAL_ERROR"
  );
}

// Express recognises error handlers by their four-argument signature.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const appError = normalize(err);
  const { statusCode, code, message, details } = appError;

  if (statusCode >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl} -> ${statusCode}`, err);
  } else {
    console.warn(`[warn] ${req.method} ${req.originalUrl} -> ${statusCode} ${code}: ${message}`);
  }

  if (res.headersSent) return next(err);

  const body = { error: { message, code } };
  if (details) body.error.details = details;
  res.status(statusCode).json(body);
}
