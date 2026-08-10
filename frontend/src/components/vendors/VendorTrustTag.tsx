// Plain-word trust levels, straight from the rating: 5 = GO-TO, ≤2 = STEER
// CLEAR, unrated = UNPROVEN (ghost), 3–4 = no tag — solid needs no label.

export type VendorTrust = "goto" | "steer" | "ghost" | null;

export const vendorTrust = (rating: number | null | undefined): VendorTrust => {
  if (rating == null) return "ghost";
  if (rating === 5) return "goto";
  if (rating <= 2) return "steer";
  return null;
};

const TAG_CLASS: Record<Exclude<VendorTrust, null>, string> = {
  goto: "text-canvas bg-amber-hi",
  steer: "text-[#ffd9d9] bg-[rgba(224,82,82,.25)] border border-[rgba(224,82,82,.45)]",
  ghost: "text-faint border border-dashed border-hairline",
};

const TAG_LABEL: Record<Exclude<VendorTrust, null>, string> = {
  goto: "GO-TO",
  steer: "STEER CLEAR",
  ghost: "UNPROVEN",
};

export const VendorTrustTag = ({ rating }: { rating: number | null | undefined }) => {
  const trust = vendorTrust(rating);
  if (!trust) return null;
  return (
    <span className={`font-condensed font-bold text-[10.5px] tracking-[.12em] px-[7px] py-[2px] rounded-[4px] ${TAG_CLASS[trust]}`}>
      {TAG_LABEL[trust]}
    </span>
  );
};
