const VARIANTS = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover border border-transparent",
  secondary: "bg-surface text-ink hover:bg-subtle border border-border-strong",
};

export default function Button({ variant = "primary", type = "button", className = "", children, ...props }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium shadow-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
