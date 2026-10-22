// Panel surface: 1px border, 18px radius and the design's soft shadow (none
// in dark mode).
export default function Card({ className = "", children, ...props }) {
  return (
    <div className={`rounded-card border border-border bg-panel p-6 shadow-card ${className}`} {...props}>
      {children}
    </div>
  );
}
