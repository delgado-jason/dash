import type { PrestigeTier } from "@/lib/metrics/agentLeaderboard";

// Prestige tier display names + accents — the metals ladder (2026-08-09).
// The old starburst emblem is retired: prestige renders as the struck Coin
// everywhere (cards, detail, trophy case, race boards, Forge Room).
export const PRESTIGE_META: Record<
  PrestigeTier,
  { label: string; fill: string; ink: string }
> = {
  rookie: { label: "", fill: "", ink: "" },
  contender: { label: "Bronze", fill: "#b5713a", ink: "#3a2008" },
  "all-star": { label: "Silver", fill: "#b9c4d4", ink: "#2c3546" },
  champion: { label: "Gold", fill: "#dfa32c", ink: "#4a3305" },
  legend: { label: "Platinum", fill: "#cbb6ff", ink: "#241a36" },
};
