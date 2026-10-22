import { formatDay } from "../../lib/format.js";
import { niceMax } from "./VolumeChart.jsx";

const numberFormat = new Intl.NumberFormat();
// Drawing area in SVG units. The SVG stretches to its box (preserveAspectRatio
// "none"), so only the line's stroke is kept from scaling.
const W = 100;
const H = 40;

// Daily counts as a line with a soft area under it: accent line, faint grid,
// and the last day (today) marked with a dot and its count. The numbers are
// also given as text for screen readers.
export default function TrendChart({ volume }) {
  const max = niceMax(Math.max(0, ...volume.map((d) => d.count)));
  const total = volume.reduce((sum, d) => sum + d.count, 0);
  const last = volume.at(-1);
  const x = (i) => (volume.length > 1 ? (i / (volume.length - 1)) * W : W / 2);
  const y = (count) => H - (count / max) * H;
  const line = volume.map((d, i) => `${x(i)},${y(d.count)}`).join(" ");
  const area = `M0,${H} L${line.replaceAll(" ", " L")} L${W},${H} Z`;
  const withYear = volume[0]?.date.slice(0, 4) !== last?.date.slice(0, 4);
  const xLabels = [volume[0], volume[Math.floor((volume.length - 1) / 2)], last];
  const summary = `${numberFormat.format(total)} feedback from ${formatDay(volume[0].date, { withYear: true })} to ${formatDay(last.date, { withYear: true })}; ${numberFormat.format(last.count)} on the last day.`;

  return (
    <figure>
      <div className="flex gap-2">
        <div
          className="flex h-44 w-7 shrink-0 flex-col justify-between text-right text-[11px] leading-none text-muted tabular-nums"
          aria-hidden="true"
        >
          <span>{numberFormat.format(max)}</span>
          <span>{numberFormat.format(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="relative h-44 min-w-0 flex-1" role="img" aria-label={summary}>
          <div className="absolute inset-x-0 top-0 border-t border-dashed border-border" aria-hidden="true" />
          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border" aria-hidden="true" />
          <div className="absolute inset-x-0 bottom-0 border-t border-border" aria-hidden="true" />
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
            aria-hidden="true"
          >
            <path d={area} className="fill-accent/15" />
            <polyline
              points={line}
              fill="none"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className="stroke-accent"
            />
          </svg>
          {/* Last point: drawn in HTML so it stays round however the SVG stretches. */}
          <span
            className="absolute h-3 w-3 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-panel bg-accent ring-4 ring-accent/20"
            style={{ left: "100%", bottom: `${(last.count / max) * 100}%` }}
            aria-hidden="true"
          />
          <span
            className="absolute -translate-x-full -translate-y-full rounded-md bg-panel2 px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-text tabular-nums"
            style={{ left: "calc(100% - 10px)", bottom: `calc(${(last.count / max) * 100}% - 6px)` }}
            aria-hidden="true"
          >
            {numberFormat.format(last.count)}
          </span>
        </div>
      </div>
      <div className="mt-1.5 ml-9 flex justify-between text-[11px] text-muted" aria-hidden="true">
        {xLabels.map((d, i) => (
          <span key={`${d.date}-${i}`}>{formatDay(d.date, { withYear })}</span>
        ))}
      </div>
    </figure>
  );
}
