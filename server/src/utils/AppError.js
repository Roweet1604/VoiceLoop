// Expected, client-facing errors. Anything that is not an AppError is treated
// as an unexpected 500 and its message is hidden in production.
export class AppError extends Error {
  constructor(message, statusCode = 500, code = "INTERNAL_ERROR", details) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    if (details) this.details = details;
  }

  static badRequest(message = "Bad request", details) {
    return new AppError(message, 400, "BAD_REQUEST", details);
  }

  static unauthorized(message = "Authentication required") {
    return new AppError(message, 401, "UNAUTHORIZED");
  }

  static forbidden(message = "You do not have permission to do this") {
    return new AppError(message, 403, "FORBIDDEN");
  }

  static notFound(message = "Resource not found") {
    return new AppError(message, 404, "NOT_FOUND");
  }

  static conflict(message = "Conflict", code = "CONFLICT") {
    return new AppError(message, 409, code);
  }
}
