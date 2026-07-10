import { ChevronUp, Star, Crown, Flame } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PrestigeTier } from "@/lib/metrics/agentLeaderboard";

// A single tier-colored starburst — the agent's career rank at a glance. It
// levels up over the years instead of piling on counts. `rookie` shows nothing.
export const PRESTIGE_META: Record<
  PrestigeTier,
  { label: string; fill: string; ink: string; icon: LucideIcon | null }
> = {
  rookie: { label: "", fill: "", ink: "", icon: null },
  contender: { label: "Contender", fill: "#c77b3e", ink: "#2a1a0a", icon: ChevronUp },
  "all-star": { label: "All-Star", fill: "#c3cad6", ink: "#1a2030", icon: Star },
  champion: { label: "Champion", fill: "#f5b03a", ink: "#3a2400", icon: Crown },
  legend: { label: "Legend", fill: "#dbe3f0", ink: "#1a2030", icon: Flame },
};

const POINTS =
  "57,30 47.39,34.66 53.38,43.5 42.73,42.73 43.5,53.38 34.66,47.39 30,57 " +
  "25.34,47.39 16.5,53.38 17.27,42.73 6.62,43.5 12.61,34.66 3,30 12.61,25.34 " +
  "6.62,16.5 17.27,17.27 16.5,6.62 25.34,12.61 30,3 34.66,12.61 43.5,6.62 " +
  "42.73,17.27 53.38,16.5 47.39,25.34";

// The emblem on its own (no positioning) — used inline in the guide.
export const PrestigeBurst = ({
  tier,
  size = 66,
}: {
  tier: PrestigeTier;
  size?: number;
}) => {
  const m = PRESTIGE_META[tier];
  if (!m.icon) return null;
  const Icon = m.icon;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 60 60" width={size} height={size} className="block">
        <polygon
          points={POINTS}
          fill={m.fill}
          stroke="#0d1117"
          strokeWidth={1.5}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        <Icon size={Math.round(size * 0.3)} color={m.ink} />
      </span>
    </div>
  );
};

// The corner sticker on an agent card.
export const PrestigeBadge = ({ tier }: { tier: PrestigeTier }) => {
  if (!PRESTIGE_META[tier].icon) return null;
  return (
    <div
      className="absolute -top-2.5 -right-2.5 rotate-[-8deg]"
      aria-hidden="true"
    >
      <PrestigeBurst tier={tier} size={66} />
    </div>
  );
};
