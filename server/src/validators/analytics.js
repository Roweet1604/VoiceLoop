// Validator for GET /api/analytics, used with validate(). Values must be plain
// strings, so operator objects ({ "$gt": "" }) and repeated keys (arrays) are
// rejected like any other invalid value.
import { isValidTimeZone, localToday, addDays, daysBetweenInclusive } from "../utils/timeZone.js";

export const ANALYTICS_MAX_DAYS = 366;
export const ANALYTICS_DEFAULT_DAYS = 30;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isRealDay = (value) =>
  typeof value === "string" &&
  DAY_PATTERN.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

// from/to are local calendar days (YYYY-MM-DD) in tz, both included.
// Defaults: tz UTC, to = today there, from = 30 days ending on `to`.
export function analyticsRange(query, now = new Date()) {
  const timeZone = query.tz ?? "UTC";
  const to = query.to ?? localToday(timeZone, now);
  const from = query.from ?? addDays(to, -(ANALYTICS_DEFAULT_DAYS - 1));
  return { from, to, timeZone, days: daysBetweenInclusive(from, to) };
}

export function analyticsQuery(query) {
  const errors = {};
  if (query.tz !== undefined && !isValidTimeZone(query.tz)) errors.tz = "Invalid time zone";
  for (const key of ["from", "to"]) {
    if (query[key] !== undefined && !isRealDay(query[key])) errors[key] = "Must be a date in the form YYYY-MM-DD";
  }
  if (Object.keys(errors).length > 0) return errors;

  const { days } = analyticsRange(query);
  if (days < 1) errors.to = "The end date must be on or after the start date";
  else if (days > ANALYTICS_MAX_DAYS) errors.from = `Choose a range of at most ${ANALYTICS_MAX_DAYS} days`;
  return errors;
}
