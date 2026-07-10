import type { MileTier } from "@/lib/metrics/mileClub";

export const MILE_TIER_COLOR: Record<MileTier, string> = {
  bronze: "#c77b3e",
  silver: "#c3cad6",
  gold: "#f5b03a",
  platinum: "#dbe3f0",
};
const INK: Record<MileTier, string> = {
  bronze: "#2a1a0a",
  silver: "#1a2030",
  gold: "#3a2400",
  platinum: "#1a2030",
};

const POINTS =
  "57,30 47.39,34.66 53.38,43.5 42.73,42.73 43.5,53.38 34.66,47.39 30,57 " +
  "25.34,47.39 16.5,53.38 17.27,42.73 6.62,43.5 12.61,34.66 3,30 12.61,25.34 " +
  "6.62,16.5 17.27,17.27 16.5,6.62 25.34,12.61 30,3 34.66,12.61 43.5,6.62 " +
  "42.73,17.27 53.38,16.5 47.39,25.34";

// A comic starburst stamped with the mile marker (e.g. "500K").
export const MilestoneBurst = ({
  tier,
  label,
  size = 58,
}: {
  tier: MileTier;
  label: string;
  size?: number;
}) => (
  <svg viewBox="0 0 60 60" width={size} height={size} className="block">
    <polygon
      points={POINTS}
      fill={MILE_TIER_COLOR[tier]}
      stroke="#0d1117"
      strokeWidth={1.5}
    />
    <text
      x={30}
      y={34}
      textAnchor="middle"
      className="font-condensed"
      fontWeight={600}
      fontSize={label.length >= 4 ? 12 : 15}
      fill={INK[tier]}
    >
      {label}
    </text>
  </svg>
);
