import { useMemo, useState } from "react";
import { Table2, BarChart3 } from "lucide-react";
import { formatDay } from "../../lib/format.js";

const numberFormat = new Intl.NumberFormat();
// Above this many days, bars are grouped by week so each stays readable.
const MAX_DAILY_BARS = 92;

// 0 -> 1, 7 -> 10, 23 -> 25: a round top for the scale.
function niceMax(value) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 2.5, 5, 10].map((step) => step * magnitude).find((candidate) => candidate >= value);
}

// Days -> bars: one per day, or one per 7 days from the first day (the last
// may be shorter).
function toBuckets(volume) {
  if (volume.length <= MAX_DAILY_BARS) return volume.map((d) => ({ from: d.date, to: d.date, count: d.count }));
  const buckets = [];
  for (let i = 0; i < volume.length; i += 7) {
    const week = volume.slice(i, i + 7);
    buckets.push({ from: week[0].date, to: week.at(-1).date, count: week.reduce((sum, d) => sum + d.count, 0) });
  }
  return buckets;
}

const bucketLabel = (b, withYear) =>
  b.from === b.to ? formatDay(b.from, { withYear }) : `${formatDay(b.from, { withYear })} – ${formatDay(b.to, { withYear })}`;

// Feedback volume as bars, with a hover readout and a table view of the same
// numbers for screen readers and anyone who prefers them.
export default function VolumeChart({ volume }) {
  const buckets = useMemo(() => toBuckets(volume), [volume]);
  const [hovered, setHovered] = useState(null);
  const [showTable, setShowTable] = useState(false);

  const weekly = buckets.length !== volume.length;
  const unit = weekly ? "week" : "day";
  const withYear = volume[0]?.date.slice(0, 4) !== volume.at(-1)?.date.slice(0, 4);
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  const scaleMax = niceMax(Math.max(0, ...buckets.map((b) => b.count)));
  const busiest = buckets.reduce((best, b) => (b.count > best.count ? b : best), buckets[0]);

  const summary =
    total === 0
      ? `No feedback between ${bucketLabel({ from: volume[0].date, to: volume.at(-1).date }, true)}.`
      : `${numberFormat.format(total)} feedback between ${bucketLabel({ from: volume[0].date, to: volume.at(-1).date }, true)}. Busiest ${unit}: ${bucketLabel(busiest, withYear)} with ${numberFormat.format(busiest.count)}.`;
  const readout =
    hovered !== null
      ? `${bucketLabel(buckets[hovered], withYear)}: ${numberFormat.format(buckets[hovered].count)}`
      : total > 0
        ? `Busiest ${unit}: ${bucketLabel(busiest, withYear)} (${numberFormat.format(busiest.count)})`
        : "No feedback in this period";

  const xLabels = [buckets[0], buckets[Math.floor((buckets.length - 1) / 2)], buckets.at(-1)];

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="min-h-5 text-xs text-ink-muted tabular-nums">{readout}</p>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          aria-expanded={showTable}
          className="inline-flex shrink-0 items-center gap-1 rounded-sm text-xs font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {showTable ? <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" /> : <Table2 className="h-3.5 w-3.5" aria-hidden="true" />}
          {showTable ? "Show chart" : "Show as table"}
        </button>
      </div>

      {showTable ? (
        <div className="mt-3 max-h-72 overflow-y-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Feedback per {unit}</caption>
            <thead className="sticky top-0 bg-canvas text-xs text-ink-muted">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">{weekly ? "Week" : "Day"}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Feedback</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {buckets.map((b) => (
                <tr key={b.from}>
                  <td className="px-3 py-1.5 text-ink">{bucketLabel(b, withYear)}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${b.count ? "text-ink" : "text-ink-muted"}`}>
                    {numberFormat.format(b.count)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-3">
          <div className="flex gap-2">
            {/* Y scale: just the top and zero; the gridlines carry the rest. */}
            <div className="flex h-40 w-6 shrink-0 flex-col justify-between text-right text-[11px] leading-none text-ink-muted tabular-nums" aria-hidden="true">
              <span>{numberFormat.format(scaleMax)}</span>
              <span>0</span>
            </div>
            <div className="relative h-40 min-w-0 flex-1" role="img" aria-label={summary}>
              <div className="absolute inset-x-0 top-0 border-t border-dashed border-border" aria-hidden="true" />
              <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border" aria-hidden="true" />
              <div className="absolute inset-x-0 bottom-0 border-t border-border-strong" aria-hidden="true" />
              <div
                className={`absolute inset-0 flex items-end ${buckets.length > 60 ? "gap-px" : "gap-0.5"}`}
                onMouseLeave={() => setHovered(null)}
                aria-hidden="true"
              >
                {buckets.map((b, i) => (
                  // The whole column is the hover target, not just the bar.
                  <div key={b.from} className="flex h-full min-w-0 flex-1 items-end" onMouseEnter={() => setHovered(i)}>
                    {b.count > 0 && (
                      <div
                        className={`w-full rounded-t-sm transition-colors ${hovered === i ? "bg-accent-hover" : "bg-accent"}`}
                        style={{ height: `${(b.count / scaleMax) * 100}%` }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-1.5 ml-8 flex justify-between text-[11px] text-ink-muted" aria-hidden="true">
            {xLabels.map((b, i) => (
              <span key={`${b.from}-${i}`}>{formatDay(b.from, { withYear })}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
