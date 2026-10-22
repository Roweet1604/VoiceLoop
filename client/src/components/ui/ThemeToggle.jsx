import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { applyTheme, getSavedTheme, systemTheme, watchSystemTheme } from "../../lib/theme.js";

// Dark/light switch: a 52x28 pill whose knob (with a sun or moon) moves right
// in dark mode. Until the user flips it, it shows and follows the OS setting.
// `showLabel` shows "Dark mode" / "Light mode" next to it; without it (e.g. in
// the narrow rail) the label is still there for screen readers and as a tooltip.
export default function ThemeToggle({ showLabel = false, className = "" }) {
  const [theme, setTheme] = useState(() => getSavedTheme() ?? systemTheme());
  const dark = theme === "dark";
  const label = dark ? "Dark mode" : "Light mode";
  const Icon = dark ? Moon : Sun;

  useEffect(() => {
    if (getSavedTheme()) return undefined;
    return watchSystemTheme((next) => {
      if (!getSavedTheme()) setTheme(next);
    });
  }, []);

  function toggle() {
    const next = dark ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={showLabel ? undefined : "Dark mode"}
      title={showLabel ? undefined : label}
      onClick={toggle}
      className={`group inline-flex items-center gap-2.5 rounded-full text-[13px] font-semibold text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
    >
      <span
        aria-hidden="true"
        className="relative inline-flex h-7 w-[52px] shrink-0 items-center rounded-full border border-border bg-panel2 transition-colors group-hover:border-faint"
      >
        <span
          className={`absolute top-[2px] left-[3px] flex h-[22px] w-[22px] items-center justify-center rounded-full bg-accent text-onAccent transition-transform duration-200 motion-reduce:transition-none ${
            dark ? "translate-x-[22px]" : "translate-x-0"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      </span>
      {/* With role="switch", the name says what "on" means; the visible text says the current state. */}
      {showLabel && (
        <>
          <span className="sr-only">Dark mode</span>
          <span aria-hidden="true">{label}</span>
        </>
      )}
    </button>
  );
}
