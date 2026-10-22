import { useEffect, useId, useRef, useState } from "react";
import { Link, NavLink } from "react-router";
import { AudioLines, LogOut, LoaderCircle, Menu, X } from "lucide-react";
import ThemeToggle from "./ui/ThemeToggle.jsx";
import Alert from "./ui/Alert.jsx";

const RAIL_STORAGE_KEY = "voiceloop-rail";
const DESKTOP_QUERY = "(min-width: 900px)";

// Shared frame for signed-in areas.
//
// From 900px: a rail on the left that the burger toggles between 68px (icons,
// with tooltips) and 240px (icons with names). The choice is remembered, and
// the rail pushes the content over rather than covering it.
// Under 900px: no rail. The burger sits in the top bar and opens the same
// menu as a drawer over the page (a modal <dialog>, which traps focus and
// closes on Escape); it also closes on a backdrop tap or when an item is chosen.
//
// nav:     [{ to, label, Icon, end? }]
// heading: shown at the top of the content area (e.g. business name)
// aside:   right side of that top row (e.g. the user's email)
export default function AppShell({ nav, homeTo, heading, aside, onLogout, loggingOut, error, children }) {
  const [expanded, setExpanded] = useState(getSavedExpanded);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef(null);
  const openButtonRef = useRef(null);
  const railId = useId();
  const drawerId = useId();

  function toggleRail() {
    const next = !expanded;
    setExpanded(next);
    try {
      localStorage.setItem(RAIL_STORAGE_KEY, next ? "expanded" : "collapsed");
    } catch {
      // Not saved; the rail still changes for this visit.
    }
  }

  // Open/close the native dialog to match state.
  useEffect(() => {
    const dialog = drawerRef.current;
    if (drawerOpen && !dialog.open) dialog.showModal();
    if (!drawerOpen && dialog.open) dialog.close();
  }, [drawerOpen]);

  // However the drawer closed (Escape, backdrop, close button, an item),
  // focus goes back to the burger that opened it.
  function onDrawerClosed() {
    setDrawerOpen(false);
    openButtonRef.current?.focus();
  }

  // The drawer only exists on narrow screens; widening the window closes it.
  useEffect(() => {
    const query = window.matchMedia?.(DESKTOP_QUERY);
    if (!query) return undefined;
    const listener = () => query.matches && setDrawerOpen(false);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  const menuProps = { nav, homeTo, onLogout, loggingOut };

  return (
    <div className="flex min-h-screen bg-bg text-text">
      <aside
        id={railId}
        className={`sticky top-0 hidden h-dvh shrink-0 border-r border-border bg-bg transition-[width] duration-150 ease-out motion-reduce:transition-none min-[900px]:block ${
          // Expanded clips the names while the width animates. Collapsed must
          // not clip, or the tooltips beside the icons would be cut off.
          expanded ? "w-60 overflow-x-hidden overflow-y-auto" : "w-[68px]"
        }`}
      >
        <RailMenu
          {...menuProps}
          expanded={expanded}
          toggle={
            <BurgerButton
              label={expanded ? "Close menu" : "Open menu"}
              expanded={expanded}
              controls={railId}
              onClick={toggleRail}
              Icon={Menu}
            />
          }
        />
      </aside>

      <dialog
        ref={drawerRef}
        id={drawerId}
        aria-label="Menu"
        onClose={onDrawerClosed}
        // A click whose target is the <dialog> itself landed on the backdrop.
        onClick={(e) => e.target === e.currentTarget && setDrawerOpen(false)}
        className="m-0 h-dvh max-h-dvh w-60 max-w-[85vw] border-r border-border bg-bg p-0 text-text backdrop:bg-scrim open:translate-x-0 starting:open:-translate-x-full transition-transform duration-200 ease-out motion-reduce:transition-none"
      >
        <RailMenu
          {...menuProps}
          expanded
          onNavigate={() => setDrawerOpen(false)}
          toggle={
            <BurgerButton
              label="Close menu"
              expanded
              controls={drawerId}
              onClick={() => setDrawerOpen(false)}
              Icon={X}
            />
          }
        />
      </dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-4 py-2 sm:px-6 min-[1600px]:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <BurgerButton
              ref={openButtonRef}
              label={drawerOpen ? "Close menu" : "Open menu"}
              expanded={drawerOpen}
              controls={drawerId}
              onClick={() => setDrawerOpen(true)}
              Icon={Menu}
              className="-ml-2 shrink-0 min-[900px]:hidden"
            />
            <div className="min-w-0">{heading}</div>
          </div>
          {aside && <div className="min-w-0 shrink text-right">{aside}</div>}
        </header>
        {/* Full width: data pages use all of it; form pages set their own max-width. */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 min-[1600px]:px-8">
          <div>
            {error && <Alert className="mb-4">{error}</Alert>}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

// Menu contents, shared by the desktop rail and the mobile drawer. Every row
// keeps its icon in the same place, so expanding only reveals the names.
// Collapsed rows are icon-only, named by aria-label with a hover/focus tooltip.
function RailMenu({ nav, homeTo, onLogout, loggingOut, expanded, toggle, onNavigate }) {
  return (
    <div className="flex min-h-full flex-col gap-1.5 px-[13px] py-3 whitespace-nowrap">
      {toggle}

      <Link
        to={homeTo}
        onClick={onNavigate}
        aria-label={expanded ? undefined : "VoiceLoop home"}
        className="mb-2 flex h-[42px] items-center gap-3 rounded-xl px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-accent text-onAccent">
          <AudioLines className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        {expanded && <span className="text-base font-semibold tracking-tight text-text">VoiceLoop</span>}
      </Link>

      <nav aria-label="Main" className="flex flex-col gap-1.5">
        {nav.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            aria-label={expanded ? undefined : label}
            className={({ isActive }) => rowClasses(isActive)}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            {expanded ? <span className="truncate">{label}</span> : <Tooltip>{label}</Tooltip>}
          </NavLink>
        ))}
      </nav>

      <div className={`mt-auto flex flex-col gap-1.5 pt-4 ${expanded ? "" : "items-center"}`}>
        <div className={expanded ? "px-1 py-1" : "py-1"}>
          <ThemeToggle showLabel={expanded} />
        </div>
        <button
          type="button"
          onClick={onLogout}
          disabled={loggingOut}
          aria-label={expanded ? undefined : "Log out"}
          aria-busy={loggingOut || undefined}
          className={`${rowClasses(false)} w-full`}
        >
          {loggingOut ? (
            <LoaderCircle className="h-5 w-5 shrink-0 animate-spin" aria-hidden="true" />
          ) : (
            <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
          )}
          {expanded ? <span>Log out</span> : <Tooltip>Log out</Tooltip>}
        </button>
      </div>
    </div>
  );
}

function BurgerButton({ ref, label, expanded, controls, onClick, Icon, className = "" }) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onClick}
      className={`flex h-[42px] w-[42px] items-center justify-center rounded-xl text-muted transition-colors hover:bg-panel2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

// 42px-high row; the icon sits 11px in, which centres it when the rail is
// collapsed to 42px of content width.
function rowClasses(isActive) {
  return `group relative flex h-[42px] items-center gap-3 rounded-xl px-[11px] text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed ${
    isActive ? "bg-panel text-text shadow-card [&>svg]:text-accent" : "text-muted hover:bg-panel2 hover:text-text"
  }`;
}

// Label shown beside a collapsed rail icon on hover or keyboard focus. Screen
// readers use the aria-label instead, so this copy is hidden from them.
function Tooltip({ children }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-full z-20 ml-2 rounded-md border border-border bg-panel px-2 py-1 text-xs font-semibold whitespace-nowrap text-text opacity-0 shadow-card transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {children}
    </span>
  );
}

function getSavedExpanded() {
  try {
    return localStorage.getItem(RAIL_STORAGE_KEY) === "expanded";
  } catch {
    return false;
  }
}
