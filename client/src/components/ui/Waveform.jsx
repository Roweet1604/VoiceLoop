// Decorative waveform: a row of 3px rounded bars. The bar heights are a fixed
// pattern derived from `seed` (e.g. the feedback id), so a recording always
// draws the same shape; they are not measured from the audio, which is why
// the component is hidden from screen readers.
//
// tone "faint" is for lists, "accent" for the player. In the player, `progress`
// (0 to 1) colours the bars already played and dims the rest.
// size "md" is 32px high (player), "sm" 20px (list rows).
export default function Waveform({ seed = "", bars = 36, tone = "faint", progress, size = "md", className = "" }) {
  const heights = barHeights(String(seed), bars);
  const played = progress == null ? bars : Math.round(Math.min(Math.max(progress, 0), 1) * bars);
  const on = tone === "accent" ? "bg-accent" : "bg-faint";

  return (
    <div aria-hidden="true" className={`flex items-center gap-[2px] ${size === "sm" ? "h-5" : "h-8"} ${className}`}>
      {heights.map((h, i) => (
        <span
          key={i}
          className={`w-[3px] shrink-0 rounded-full ${i < played ? on : "bg-faint/35"}`}
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

// The seed is hashed (FNV-1a) into the start state of a small PRNG
// (mulberry32), giving heights between 20% and 100%, smoothed so the shape
// looks like speech rather than noise.
function barHeights(seed, count) {
  let state = 2166136261;
  for (const ch of seed) state = Math.imul(state ^ ch.charCodeAt(0), 16777619);
  const raw = Array.from({ length: count }, () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  });
  return raw.map((v, i) => {
    const neighbours = ((raw[i - 1] ?? v) + v * 2 + (raw[i + 1] ?? v)) / 4;
    return Math.round(20 + neighbours * 80);
  });
}
