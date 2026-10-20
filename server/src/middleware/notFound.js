import { AppError } from "../utils/AppError.js";

// Mounted after all routes: anything that reaches here matched nothing.
export function notFound(req, res, next) {
  next(AppError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}
