import { CircleAlert, CircleCheck, Info } from "lucide-react";

const TONES = {
  danger: { classes: "border-danger/30 bg-dangerSoft text-danger", Icon: CircleAlert },
  success: { classes: "border-ok/30 bg-okSoft text-okText", Icon: CircleCheck },
  info: { classes: "border-accent/30 bg-accentSoft text-accentText", Icon: Info },
};

// Inline status message. Danger alerts use role="alert" so screen readers
// announce them as soon as they appear.
export default function Alert({ tone = "danger", children, className = "" }) {
  const { classes, Icon } = TONES[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-control border px-3 py-2.5 text-sm ${classes} ${className}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
