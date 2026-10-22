import { LoaderCircle } from "lucide-react";

// Primary: accent fill. Secondary: transparent with a 1px border. Danger: the
// secondary shape with danger text, so a destructive button never shouts.
const SECONDARY = "border border-faint/45 bg-transparent text-text hover:bg-panel2";
const VARIANTS = {
  primary: "border border-transparent bg-accent text-onAccent hover:bg-accent-hover",
  secondary: SECONDARY,
  danger: "border border-danger/40 bg-transparent text-danger hover:bg-dangerSoft",
};
// Earlier name for the same style.
VARIANTS.dangerOutline = VARIANTS.danger;

const SIZES = {
  md: "px-4 py-2 text-[13px]",
  sm: "px-2.5 py-1 text-xs",
};

// `loading` disables the button and shows a spinner in place of the icon,
// keeping the label so the button doesn't change width.
export default function Button({
  variant = "primary",
  size = "md",
  type = "button",
  loading = false,
  disabled,
  className = "",
  children,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {loading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
