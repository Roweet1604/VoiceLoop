import { useId } from "react";
import { CircleAlert } from "lucide-react";

export const inputClasses =
  "block w-full rounded-control border bg-panel2 px-3 py-2 text-sm text-text placeholder:text-faint " +
  "transition-colors focus:border-accent focus:outline-2 focus:outline-offset-1 focus:outline-accent " +
  "disabled:cursor-not-allowed disabled:opacity-60";

// Label, input, hint and error wired together for screen readers.
// `trailing` renders inside the input on the right (e.g. a show/hide toggle).
// `multiline` renders a textarea instead of an input; `inputClassName` adds
// classes to the control itself. Errors show an icon as well as the colour.
export default function TextField({
  label,
  hint,
  error,
  trailing,
  multiline = false,
  className = "",
  inputClassName = "",
  ...inputProps
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const Control = multiline ? "textarea" : "input";

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-semibold text-text">
        {label}
      </label>
      <div className="relative mt-1.5">
        <Control
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={[errorId, hintId].filter(Boolean).join(" ") || undefined}
          className={`${inputClasses} ${error ? "border-danger" : "border-border"} ${trailing ? "pr-10" : ""} ${multiline ? "resize-y" : ""} ${inputClassName}`}
          {...inputProps}
        />
        {trailing && <div className="absolute inset-y-0 right-0 flex items-center pr-1">{trailing}</div>}
      </div>
      {error ? (
        <p id={errorId} className="mt-1.5 flex items-start gap-1.5 text-xs text-danger">
          <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : (
        hint && (
          <p id={hintId} className="mt-1.5 text-xs text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
