import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

const MENU_WIDTH = 220;
const GAP = 6;

// "More" button with a small menu of actions.
// items: [{ label, Icon?, onSelect, danger?, separated? }]
//
// The menu is positioned `fixed` from the button's position, so a parent
// that scrolls sideways (a table) can't clip it. It opens below the button,
// or above when there isn't room. Focus moves to the first item; arrow keys
// move between items; Escape, Tab, scrolling or a click outside close it,
// and focus returns to the button.
export default function ActionMenu({ label = "More", srLabel, items }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();

  function close({ refocus = true } = {}) {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  }

  useLayoutEffect(() => {
    if (!open) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const height = menuRef.current?.offsetHeight ?? 0;
    const below = rect.bottom + GAP + height <= window.innerHeight;
    setPosition({
      top: below ? rect.bottom + GAP : Math.max(GAP, rect.top - GAP - height),
      left: Math.min(Math.max(GAP, rect.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - GAP),
    });
    menuRef.current?.querySelector("button")?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (!menuRef.current?.contains(e.target) && !buttonRef.current?.contains(e.target)) close({ refocus: false });
    };
    const onViewportChange = () => close({ refocus: false });
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open]);

  function onMenuKeyDown(e) {
    const buttons = [...menuRef.current.querySelectorAll("button")];
    const index = buttons.indexOf(document.activeElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      close({ refocus: false });
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      buttons[(index + step + buttons.length) % buttons.length]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      (e.key === "Home" ? buttons[0] : buttons.at(-1))?.focus();
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={srLabel}
        onClick={() => (open ? close() : setOpen(true))}
        className="inline-flex items-center gap-1.5 rounded-control border border-faint/45 px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-text transition-colors hover:bg-panel2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        {label}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={srLabel ?? label}
          onKeyDown={onMenuKeyDown}
          style={{ width: MENU_WIDTH, top: position?.top ?? -9999, left: position?.left ?? -9999 }}
          className="fixed z-50 rounded-card border border-border bg-panel p-1.5 shadow-card"
        >
          {items.map(({ label: itemLabel, Icon, onSelect, danger, separated }) => (
            <div key={itemLabel} className={separated ? "mt-1.5 border-t border-border pt-1.5" : ""}>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  // Focus the button first, so a dialog the action opens
                  // returns focus there when it closes.
                  close();
                  onSelect();
                }}
                className={`flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-left text-sm font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
                  danger ? "text-danger hover:bg-dangerSoft" : "text-text hover:bg-panel2"
                }`}
              >
                {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
                {itemLabel}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
