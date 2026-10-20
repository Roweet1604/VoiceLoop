// Validators for /api/links, used with validate(). Routes read only `name`
// and `isActive`; any other body field (code, businessId, ...) is ignored.

const NAME_MIN = 2;
const NAME_MAX = 60;

function checkName(value) {
  if (typeof value !== "string" || !value.trim()) return "Link name is required";
  const length = value.trim().length;
  if (length < NAME_MIN || length > NAME_MAX) return `Link name must be ${NAME_MIN} to ${NAME_MAX} characters`;
  return null;
}

export function createLinkBody(body) {
  const problem = checkName(body.name);
  return problem ? { name: problem } : {};
}

// Rename and/or activate/deactivate; at least one.
export function updateLinkBody(body) {
  const errors = {};
  if (body.name === undefined && body.isActive === undefined) {
    return { body: "Provide a new name or isActive" };
  }
  if (body.name !== undefined) {
    const problem = checkName(body.name);
    if (problem) errors.name = problem;
  }
  if (body.isActive !== undefined && typeof body.isActive !== "boolean") {
    errors.isActive = "isActive must be true or false";
  }
  return errors;
}
