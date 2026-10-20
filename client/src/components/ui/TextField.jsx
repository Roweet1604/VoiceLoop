import { useId } from "react";

export const inputClasses =
  "block w-full rounded-md border bg-surface px-3 py-2 text-sm text-ink shadow-xs placeholder:text-ink-subtle " +
  "transition-colors focus:border-accent focus:outline-2 focus:outline-offset-0 focus:outline-accent/20 " +
  "disabled:cursor-not-allowed disabled:bg-subtle";

// Label, input, hint and error wired together for screen readers.
// `trailing` renders inside the input on the right (e.g. a show/hide toggle).
export default function TextField({ label, hint, error, trailing, className = "", ...inputProps }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative mt-1.5">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={[errorId, hintId].filter(Boolean).join(" ") || undefined}
          className={`${inputClasses} ${error ? "border-danger" : "border-border-strong"} ${trailing ? "pr-10" : ""}`}
          {...inputProps}
        />
        {trailing && <div className="absolute inset-y-0 right-0 flex items-center pr-1">{trailing}</div>}
      </div>
      {error ? (
        <p id={errorId} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="mt-1.5 text-xs text-ink-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
