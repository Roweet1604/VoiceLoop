import { AppError } from "../utils/AppError.js";

// Route-level request validation.
//
// A validator is a plain function that receives one part of the request
// (body, query or params) and returns an object of { field: "problem" }.
// An empty object means the input is valid.
//
//   const createThing = (body) => {
//     const errors = {};
//     if (typeof body.name !== "string" || !body.name.trim()) errors.name = "Name is required";
//     return errors;
//   };
//
//   router.post("/", validate({ body: createThing }), handler);
//
// On failure this responds 400 with
//   { error: { message: "Validation failed", code: "BAD_REQUEST", details: { name: "Name is required" } } }
export function validate(validators) {
  return (req, res, next) => {
    const details = {};
    for (const part of ["params", "query", "body"]) {
      const check = validators[part];
      if (!check) continue;
      Object.assign(details, check(req[part] ?? {}));
    }
    if (Object.keys(details).length > 0) {
      return next(AppError.badRequest("Validation failed", details));
    }
    next();
  };
}
