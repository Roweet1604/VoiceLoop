import { Link } from "react-router";

// Two-pane list/detail layout. From 900px: a list column 28% of the window
// wide (360-480px) with a 1px
// right border and the detail beside it. Under 900px only one pane shows at
// a time: the list, or the detail once something is selected (`showDetail`),
// so the detail reads as its own screen with a Back link.
// Give it a height (className) and from 900px each pane scrolls on its own;
// without one the panes simply grow with their content. `listFooter` (e.g.
// paging) stays pinned under the list while the list scrolls.
export default function ListDetail({ list, listFooter, detail, showDetail = false, className = "" }) {
  return (
    <div
      className={`min-[900px]:grid min-[900px]:grid-cols-[clamp(360px,28vw,480px)_minmax(0,1fr)] min-[900px]:grid-rows-[minmax(0,1fr)] min-[900px]:overflow-clip min-[900px]:rounded-card min-[900px]:border min-[900px]:border-border ${className}`}
    >
      <div
        className={`min-w-0 max-[899px]:overflow-clip max-[899px]:rounded-card max-[899px]:border max-[899px]:border-border min-[900px]:flex min-[900px]:min-h-0 min-[900px]:flex-col min-[900px]:border-r min-[900px]:border-border ${showDetail ? "max-[899px]:hidden" : ""}`}
      >
        <div className="min-w-0 min-[900px]:min-h-0 min-[900px]:flex-1 min-[900px]:overflow-y-auto">{list}</div>
        {listFooter && <div className="shrink-0">{listFooter}</div>}
      </div>
      <section
        className={`min-w-0 bg-panel min-[900px]:overflow-y-auto max-[899px]:rounded-card max-[899px]:border max-[899px]:border-border ${showDetail ? "" : "max-[899px]:hidden"}`}
      >
        {detail}
      </section>
    </div>
  );
}

// The list itself; rows are ListDetailItem.
export function ListDetailItems({ label, children }) {
  return (
    <ul aria-label={label} className="divide-y divide-border">
      {children}
    </ul>
  );
}

// One row. The selected row gets the panel background and a 3px accent bar
// on its left edge, and is marked aria-current for screen readers.
export function ListDetailItem({ to, selected = false, onClick, children }) {
  return (
    <li>
      <Link
        to={to}
        onClick={onClick}
        aria-current={selected ? "true" : undefined}
        className={`relative block px-5 py-4 text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
          selected ? "bg-panel text-text" : "text-text hover:bg-panel2"
        }`}
      >
        {selected && <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" aria-hidden="true" />}
        {children}
      </Link>
    </li>
  );
}
