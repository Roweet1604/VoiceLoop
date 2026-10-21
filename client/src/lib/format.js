// Display formatting in the viewer's locale and time zone.

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

export const formatDate = (value) => dateFormat.format(new Date(value));
export const formatTime = (value) => timeFormat.format(new Date(value));

// Calendar days as "YYYY-MM-DD" (what the analytics API uses), in the
// viewer's local time.
export function toDayString(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function shiftDay(day, days) {
  const [y, m, d] = day.split("-").map(Number);
  return toDayString(new Date(y, m - 1, d + days));
}

// "2026-05-03" -> "May 3" (or "May 3, 2026" with withYear). Parsed as a local
// date, so it never shifts by a day across time zones.
export function formatDay(day, { withYear = false } = {}) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(withYear && { year: "numeric" }),
  });
}

// 75 -> "1:15". For recording lengths.
export function formatDuration(seconds) {
  const whole = Math.max(0, Math.floor(seconds ?? 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

// 1536000 -> "1.5 MB".
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
