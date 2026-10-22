import { useEffect, useId, useRef } from "react";
import { ChevronDown } from "lucide-react";

// Toolbar dropdown: a compact button showing the filter's name and current
// value, and a small panel under it with the controls. It follows the
// disclosure pattern: the panel comes right after the button in the DOM, so
// Tab moves into it; Escape or a click outside closes it, and Escape returns
// focus to the button. The parent decides which one is open, so only one is.
//
// From 900px the panel hangs under its own button (`align` left or right);
// below that it spans the toolbar, which must be `relative`.
export default function FilterPopover({
  label,
  value,
  badge,
  active = false,
  open,
  onOpenChange,
  align = "left",
  panelClassName = "",
  children,
}) {
  const wrapperRef = useRef(null);
  const buttonRef = useRef(null);
  const panelId = useId();
  // Whether focus is inside the panel. If the panel closes while it is (e.g.
  // a choice was picked and the parent closed it), focus goes back to the
  // button instead of being lost with the removed panel.
  const focusInPanel = useRef(false);

  useEffect(() => {
    if (open || !focusInPanel.current) return;
    focusInPanel.current = false;
    buttonRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(e) {
      if (!wrapperRef.current?.contains(e.target)) onOpenChange(false);
    }
    function onKeyDown(e) {
      if (e.key !== "Escape") return;
      onOpenChange(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={wrapperRef} className="min-[900px]:relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
        className={`inline-flex h-9 items-center gap-1.5 rounded-control border px-3 text-[13px] whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          active ? "border-accent bg-accentSoft text-text" : "border-border bg-panel2 text-text hover:border-faint"
        }`}
      >
        <span className="text-muted">{label}</span>
        {value && <span className="font-semibold">{value}</span>}
        {badge > 0 && (
          <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-onAccent">{badge}</span>
        )}
        <ChevronDown
          className={`h-4 w-4 text-muted transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          id={panelId}
          role="group"
          aria-label={label}
          onFocus={() => (focusInPanel.current = true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) focusInPanel.current = false;
          }}
          className={`absolute inset-x-0 top-full z-30 mt-2 rounded-card border border-border bg-panel p-4 shadow-card min-[900px]:inset-x-auto min-[900px]:max-h-[60dvh] min-[900px]:w-80 min-[900px]:overflow-y-auto ${
            align === "right" ? "min-[900px]:right-0" : "min-[900px]:left-0"
          } ${panelClassName}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
