import { Crown, ThumbsUp, Minus, AlertTriangle, Ban } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// The 1–5 vendor rating as a bold comic medallion — one clear verdict. Cost-side
// twin of the agent RatingMedallion, worded for a vendor you pay.
const TIERS: Record<number, { label: string; cls: string; Icon: LucideIcon }> = {
  5: { label: "Go-to", cls: "bg-amber text-steel", Icon: Crown },
  4: { label: "Solid", cls: "bg-[#2fae6b] text-[#06231a]", Icon: ThumbsUp },
  3: { label: "Fine", cls: "bg-[#45526e] text-light", Icon: Minus },
  2: { label: "Last resort", cls: "bg-[#d9761c] text-steel", Icon: AlertTriangle },
  1: { label: "Avoid", cls: "bg-[#d23b3b] text-white", Icon: Ban },
};

export const VendorRatingMedallion = ({
  rating,
  size = "sm",
}: {
  rating?: number | null;
  size?: "sm" | "lg";
}) => {
  const pad = size === "lg" ? "text-sm px-3 py-1.5" : "text-xs px-2.5 py-1";
  const base = `inline-flex items-center gap-1.5 rounded font-condensed uppercase tracking-wide ${pad}`;

  if (!rating)
    return <span className={`${base} bg-steel text-muted-text`}>Unrated</span>;

  const t = TIERS[rating];
  const Icon = t.Icon;
  return (
    <span className={`${base} ${t.cls}`}>
      <Icon size={size === "lg" ? 16 : 13} /> {t.label}
    </span>
  );
};
