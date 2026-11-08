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
  "call-first": { label: "Top pick", fg: "var(--color-status-positive-text)", bg: "var(--color-status-positive-bg)", border: "color-mix(in srgb, var(--color-status-positive-text) 40%, transparent)", rank: 4 },
  solid: { label: "Solid", fg: "var(--color-status-info-text)", bg: "var(--color-status-info-bg)", border: "color-mix(in srgb, var(--color-status-info-text) 40%, transparent)", rank: 3 },
  watch: { label: "Watch", fg: "var(--color-amber-hi)", bg: "var(--color-status-aware-bg)", border: "color-mix(in srgb, var(--color-amber-hi) 45%, transparent)", rank: 2 },
  cold: { label: "Cold", fg: "var(--color-dim)", bg: "var(--color-status-neutral-bg)", border: "var(--color-plate)", rank: 1 },
  thin: { label: "Thin data", fg: "var(--color-faint)", bg: "var(--color-well)", border: "var(--color-hairline-lo)", rank: 0 },
};

export const SPECIALTY_META: Record<
  Exclude<SpecialtyTag, "standard">,
  { label: string; fg: string; bg: string; border: string }
> = {
  oversize: { label: "OVERSIZE", fg: "var(--color-amber-hi)", bg: "var(--color-status-aware-bg)", border: "color-mix(in srgb, var(--color-amber-hi) 45%, transparent)" },
  specialty: { label: "SPECIALTY", fg: "var(--color-cat2)", bg: "color-mix(in srgb, var(--color-cat2) 15%, transparent)", border: "color-mix(in srgb, var(--color-cat2) 40%, transparent)" },
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
  bad: "var(--color-status-negative-text)",
  good: "var(--color-status-positive-text)",
  none: "var(--color-dim)",
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
  up: { glyph: "▲", fg: "var(--color-status-positive-text)" },
  down: { glyph: "▼", fg: "var(--color-status-negative-text)" },
  flat: { glyph: "—", fg: "var(--color-dim)" },
} as const;
