// Shared display metadata for the agent roster — tier chips, specialty badges,
// and the Dwell status — so the card and the table read identically.
import type {
  GoToTier,
  SpecialtyTag,
  AgentScorecard,
} from "@/lib/metrics/agentScorecard";

export const TIER_META: Record<
  GoToTier,
  { label: string; fg: string; bg: string; border: string; rank: number }
> = {
  "call-first": { label: "Top pick", fg: "#4ade80", bg: "#123020", border: "#1f6e4a", rank: 4 },
  solid: { label: "Solid", fg: "#6cc6e6", bg: "#12222e", border: "#245b70", rank: 3 },
  watch: { label: "Watch", fg: "#f5a623", bg: "#241a06", border: "#85560b", rank: 2 },
  cold: { label: "Cold", fg: "#9aa4b5", bg: "#171c26", border: "#2a3347", rank: 1 },
  thin: { label: "Thin data", fg: "#6b7688", bg: "#0b111c", border: "#1a2130", rank: 0 },
};

export const SPECIALTY_META: Record<
  Exclude<SpecialtyTag, "standard">,
  { label: string; fg: string; bg: string; border: string }
> = {
  oversize: { label: "OVERSIZE", fg: "#f5b03a", bg: "#3a2408", border: "#85560b" },
  specialty: { label: "SPECIALTY", fg: "#5fd0e0", bg: "#0f2c3a", border: "#1d5e70" },
};

export type DwellTone = "bad" | "good" | "none";
export interface DwellStatus {
  label: string;
  tone: DwellTone;
}

// Dwell reads as MONEY, not raw sitting: only confirmed-billable-and-unpaid
// detention ("$ sat") counts against an agent. Priced-in oversize crane time
// (never confirmed) shows as "clean".
export const dwellStatus = (c: AgentScorecard): DwellStatus => {
  if (c.moneyLostLoads > 0)
    return { label: `$ sat · ${c.moneyLostLoads}`, tone: "bad" };
  if (c.collectedLoads > 0) return { label: "collected", tone: "good" };
  return { label: "clean", tone: "none" };
};

export const DWELL_TONE: Record<DwellTone, string> = {
  bad: "#f87171",
  good: "#4ade80",
  none: "#8b93a3",
};

// The single most useful nudge for a card/row: the gut-vs-data disagreement, or
// a going-cold reminder. null = nothing worth flagging.
export const flagText = (c: AgentScorecard): string | null => {
  if (c.ratingFlag === "under") return "you rate low — data says keeper";
  if (c.ratingFlag === "over") return "you rate high — data runs cooler";
  if (c.tier === "cold" && c.daysSince != null)
    return `going cold · ${c.daysSince}d quiet`;
  return null;
};

export const TREND_META = {
  up: { glyph: "▲", fg: "#4ade80" },
  down: { glyph: "▼", fg: "#f87171" },
  flat: { glyph: "—", fg: "#8b93a3" },
} as const;
