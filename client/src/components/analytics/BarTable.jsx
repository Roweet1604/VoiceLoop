import { Link } from "react-router";

const numberFormat = new Intl.NumberFormat();
const percentFormat = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 0 });

// A count per label as a real table, with a proportional bar in each row. The
// numbers are always visible text, so the bars never carry meaning alone.
// rows: [{ key, label, count, to?, note? }]
export default function BarTable({ caption, labelHeading, rows }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const max = Math.max(0, ...rows.map((row) => row.count));

  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">{labelHeading}</th>
          <th scope="col">Share</th>
          <th scope="col">Feedback</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td className="w-2/5 py-1.5 pr-3 align-middle">
              {row.to ? (
                <Link to={row.to} className="break-words text-ink hover:underline">
                  {row.label}
                </Link>
              ) : (
                <span className="break-words text-ink">{row.label}</span>
              )}
              {row.note && <span className="ml-1 text-xs text-ink-muted">{row.note}</span>}
            </td>
            <td className="py-1.5 pr-3 align-middle">
              <div className="h-2 rounded-sm bg-subtle" aria-hidden="true">
                {row.count > 0 && (
                  <div className="h-full rounded-sm bg-accent" style={{ width: `${(row.count / max) * 100}%` }} />
                )}
              </div>
              <span className="sr-only">{total ? percentFormat.format(row.count / total) : "0%"}</span>
            </td>
            <td className={`w-16 py-1.5 text-right align-middle tabular-nums ${row.count ? "text-ink" : "text-ink-muted"}`}>
              {numberFormat.format(row.count)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
