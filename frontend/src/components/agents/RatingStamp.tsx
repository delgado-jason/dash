// The hero rating on the agent detail page — the verdict die-pressed into
// steel (the comic rubber stamp, forged; v2 2026-08-09). Same 1–5 labels and
// tier colors — they're semantic. (The list view uses RatingMedallion.)
const STAMP: Record<number, { label: string; color: string; glow: string }> = {
  5: { label: "Call first", color: "#f5b03a", glow: "rgba(232,148,10,.18)" },
  4: { label: "Good", color: "#4ade80", glow: "rgba(74,222,128,.15)" },
  3: { label: "Default", color: "#8494ab", glow: "rgba(132,148,171,.12)" },
  2: { label: "Avoid", color: "#e0822e", glow: "rgba(224,130,46,.15)" },
  1: { label: "Blacklist", color: "#f87171", glow: "rgba(248,113,113,.16)" },
};

export const RatingStamp = ({ rating }: { rating?: number | null }) => {
  const s = rating
    ? STAMP[rating]
    : { label: "Unrated", color: "#8494ab", glow: "rgba(132,148,171,.1)" };
  return (
    <div
      className="inline-block px-3.5 py-1 -rotate-3 font-forge font-bold uppercase text-[17px] tracking-[.12em] rounded-lg select-none"
      style={{
        color: s.color,
        opacity: 0.92,
        textShadow: "0 1px 0 rgba(0,0,0,.55)",
        background: "linear-gradient(178deg, #2c3549, #1e2636)",
        boxShadow: `inset 0 2px 6px rgba(0,0,0,.6), inset 0 0 12px ${s.glow}`,
      }}
    >
      {s.label}
    </div>
  );
};
