import { LoaderCircle } from "lucide-react";

const VARIANTS = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover border border-transparent",
  secondary: "bg-surface text-ink hover:bg-subtle border border-border-strong",
  danger: "bg-danger text-white hover:bg-danger/90 border border-transparent",
  // Destructive action that sits next to ordinary ones without shouting.
  dangerOutline: "bg-surface text-danger hover:bg-danger-soft border border-danger/40",
};

const SIZES = {
  md: "px-4 py-2 text-sm",
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
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium shadow-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {loading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
