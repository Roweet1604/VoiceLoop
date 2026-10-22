// Pill-shaped filter. Selected chips take the accent fill; `selected` is
// exposed as aria-pressed so screen readers announce the state.
export default function Chip({ selected = false, className = "", children, ...props }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        selected
          ? "border-transparent bg-accent text-onAccent"
          : "border-border bg-transparent text-muted hover:bg-panel2 hover:text-text"
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

// Horizontal row of chips that wraps on narrow screens.
export function ChipGroup({ label, className = "", children }) {
  return (
    <div role="group" aria-label={label} className={`flex flex-wrap gap-2 ${className}`}>
      {children}
    </div>
  );
}
