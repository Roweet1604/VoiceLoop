// Bordered, rounded frame for a <table>. It scrolls sideways on small screens
// instead of squashing columns; give the table a min-width to set where that
// starts. Header cells get the 11px uppercase faint style and rows a 1px
// divider, so pages only write plain <thead>/<tbody> markup.
//
// `label` names the scroll region for keyboard and screen-reader users, who
// can focus it and scroll with the arrow keys.
export default function Table({ label, className = "", children }) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={`overflow-x-auto rounded-card border border-border bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
    >
      <table
        className={
          "w-full text-left text-sm text-text " +
          "[&_thead_th]:px-4 [&_thead_th]:py-2.5 [&_thead_th]:text-[11px] [&_thead_th]:font-semibold [&_thead_th]:tracking-wider [&_thead_th]:text-muted [&_thead_th]:uppercase " +
          "[&_tbody_td]:px-4 [&_tbody_td]:py-3 [&_tbody_tr]:border-t [&_tbody_tr]:border-border"
        }
      >
        {children}
      </table>
    </div>
  );
}
