// The "hero" rating display for the agent detail page — a comic rubber stamp,
// tier-colored and cocked at an angle. (The list view uses RatingMedallion.)
const STAMP: Record<number, { label: string; color: string }> = {
  5: { label: "Call first", color: "#e8940a" },
  4: { label: "Good", color: "#3fbf78" },
  3: { label: "Default", color: "#9daabb" },
  2: { label: "Avoid", color: "#e0822e" },
  1: { label: "Blacklist", color: "#e24b4a" },
};

export const RatingStamp = ({ rating }: { rating?: number | null }) => {
  const s = rating ? STAMP[rating] : { label: "Unrated", color: "#9daabb" };
  return (
    <div
      className="inline-block px-4 py-1 rotate-[-6deg] font-comic uppercase text-2xl rounded"
      style={{
        border: `3px double ${s.color}`,
        color: s.color,
        letterSpacing: "2px",
      }}
    >
      {s.label}
    </div>
  );
};
