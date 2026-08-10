import type { RateLadder } from "@/lib/metrics/rateTargets";

// The mockup's banded ladder: one bar scaled walk-away → past-strong, cells
// tinted by the zone their value lands in, with the live booking rate as the
// YOU BOOK HERE marker. Presentation of getRateLadder — no tier math here.
export const BandedLadder = ({
  ladder,
  rpm,
  label,
}: {
  ladder: RateLadder;
  rpm: number | null;
  label?: string;
}) => {
  if (
    ladder.walkAway == null ||
    ladder.minimum == null ||
    ladder.target == null ||
    ladder.strong == null
  )
    return null;
  const lo = ladder.walkAway * 0.92;
  const hi = Math.max(ladder.strong * 1.12, rpm ?? 0);
  const span = Math.max(0.0001, hi - lo);
  const at = (v: number) => Math.min(1, Math.max(0, (v - lo) / span));
  const CELLS = 14;
  const zone = (v: number): React.CSSProperties => {
    if (v < ladder.walkAway!)
      return { background: "rgba(224,82,82,.25)", border: "1px solid rgba(224,82,82,.4)" };
    if (v < ladder.minimum!)
      return { background: "rgba(232,148,10,.28)", border: "1px solid rgba(232,148,10,.4)" };
    if (v < ladder.target!)
      return { background: "rgba(111,208,140,.25)", border: "1px solid rgba(111,208,140,.4)" };
    return {
      background: "linear-gradient(180deg, var(--color-hot), var(--color-amber))",
      border: "1px solid rgba(245,176,58,.55)",
    };
  };
  return (
    <div className="mt-2">
      {label && (
        <p className="font-condensed font-semibold text-[10.5px] tracking-[.14em] uppercase text-faint mb-[6px]">
          {label}
        </p>
      )}
      <div className="relative flex gap-[4px]">
        {rpm != null && (
          <span
            className="absolute -top-[6px] -bottom-[6px] w-[2px] bg-ink"
            style={{ left: `${at(rpm) * 100}%` }}
            aria-hidden
          >
            <span className="absolute -top-[14px] -left-[30px] font-condensed text-[9px] tracking-[.08em] text-faint whitespace-nowrap">
              YOU BOOK HERE · ${rpm.toFixed(2)}
            </span>
          </span>
        )}
        {Array.from({ length: CELLS }, (_, ci) => {
          const v = lo + ((ci + 0.5) / CELLS) * span;
          return <i key={ci} className="flex-1 h-[14px] rounded-[3px]" style={zone(v)} />;
        })}
      </div>
      <div className="flex justify-between font-condensed text-[10.5px] text-faint mt-[6px] tabular-nums">
        <span>${ladder.walkAway.toFixed(2)} walk-away</span>
        <span>minimum · ${ladder.minimum.toFixed(2)}</span>
        <span>target · ${ladder.target.toFixed(2)}</span>
        <span>strong · ${ladder.strong.toFixed(2)}</span>
      </div>
    </div>
  );
};
