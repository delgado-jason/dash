// The "hero" rating display for the vendor detail page — a comic rubber stamp,
// tier-colored and cocked at an angle. Cost-side twin of the agent RatingStamp.
const STAMP: Record<number, { label: string; color: string }> = {
  5: { label: "Go-to", color: "#e8940a" },
  4: { label: "Solid", color: "#3fbf78" },
  3: { label: "Fine", color: "#9daabb" },
  2: { label: "Last resort", color: "#e0822e" },
  1: { label: "Avoid", color: "#e24b4a" },
};

export const VendorRatingStamp = ({ rating }: { rating?: number | null }) => {
  const s = rating ? STAMP[rating] : { label: "Unrated", color: "#9daabb" };
  return (
    <div
      className="inline-block px-4 py-1 rotate-[-6deg] font-forge font-bold uppercase text-2xl rounded"
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
