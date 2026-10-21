// Calendar-day arithmetic in an IANA time zone, without a date library.
// Days are "YYYY-MM-DD" strings.

export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== "string" || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

// Today's date in `timeZone`.
export function localToday(timeZone, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// "2026-03-31" + 1 -> "2026-04-01". Pure calendar arithmetic, no time zone.
export function addDays(day, days) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// Whole days from `from` to `to`, counting both ends.
export function daysBetweenInclusive(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

// How far `timeZone`'s wall clock is ahead of UTC at instant `ms`.
function offsetAt(ms, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const wallClockAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wallClockAsUtc - Math.floor(ms / 1000) * 1000;
}

// The instant `day` begins in `timeZone`. The second pass corrects for a
// daylight-saving change between the first guess and the answer.
export function startOfLocalDay(day, timeZone) {
  const [y, m, d] = day.split("-").map(Number);
  const midnightUtc = Date.UTC(y, m - 1, d);
  const guess = midnightUtc - offsetAt(midnightUtc, timeZone);
  return new Date(midnightUtc - offsetAt(guess, timeZone));
}
