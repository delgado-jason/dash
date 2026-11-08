// The hero rating on the agent detail page — the verdict die-pressed into
// steel (the comic rubber stamp, forged; v2 2026-08-09). Same 1–5 labels and
// tier colors — they're semantic. (The list view uses RatingMedallion.)
const STAMP: Record<number, { label: string; color: string; glow: string }> = {
  5: { label: "Call first", color: "var(--color-amber-hi)", glow: "color-mix(in srgb, var(--color-amber) 18%, transparent)" },
  4: { label: "Good", color: "var(--color-status-positive-text)", glow: "color-mix(in srgb, var(--color-status-positive-text) 15%, transparent)" },
  3: { label: "Default", color: "var(--color-dim)", glow: "color-mix(in srgb, var(--color-dim) 12%, transparent)" },
  2: { label: "Avoid", color: "var(--color-amber)", glow: "color-mix(in srgb, var(--color-amber) 15%, transparent)" },
  1: { label: "Blacklist", color: "var(--color-status-negative-text)", glow: "color-mix(in srgb, var(--color-status-negative-text) 16%, transparent)" },
};

export const RatingStamp = ({ rating }: { rating?: number | null }) => {
  const s = rating
    ? STAMP[rating]
    : { label: "Unrated", color: "var(--color-dim)", glow: "color-mix(in srgb, var(--color-dim) 10%, transparent)" };
  return (
    <div
      className="inline-block px-3.5 py-1 -rotate-3 font-forge font-bold uppercase text-[17px] tracking-[.12em] rounded-lg select-none"
      style={{
        color: s.color,
        opacity: 0.92,
        background: "linear-gradient(178deg, var(--color-plate-a), var(--color-plate-b))",
        boxShadow: `var(--shadow-inset), inset 0 0 12px ${s.glow}`,
      }}
    >
      {s.label}
    </div>
  );
};
