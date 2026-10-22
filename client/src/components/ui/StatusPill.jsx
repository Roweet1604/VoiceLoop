// Small status label. Colour is never the only signal: the text always says
// the status, and the dot is decorative.
const TONES = {
  ok: "border-ok/35 bg-okSoft text-okText",
  warn: "border-warn/35 bg-warnSoft text-warn",
  danger: "border-danger/35 bg-dangerSoft text-danger",
  neutral: "border-border bg-panel2 text-muted",
};

const DOTS = { ok: "bg-ok", warn: "bg-warn", danger: "bg-danger", neutral: "bg-faint" };

export default function StatusPill({ tone = "neutral", icon: Icon, className = "", children }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${TONES[tone]} ${className}`}
    >
      {Icon ? (
        <Icon className="h-3 w-3" aria-hidden="true" />
      ) : (
        <span className={`h-1.5 w-1.5 rounded-full ${DOTS[tone]}`} aria-hidden="true" />
      )}
      {children}
    </span>
  );
}
