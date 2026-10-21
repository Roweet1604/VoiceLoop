// Display formatting in the viewer's locale and time zone.

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

export const formatDate = (value) => dateFormat.format(new Date(value));
export const formatTime = (value) => timeFormat.format(new Date(value));

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
