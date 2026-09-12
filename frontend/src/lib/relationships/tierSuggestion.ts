// Tier bands = the live rate ladder's own steps (decision 1). Nothing here is
// stored: the suggestion recomputes whenever the ladder does, and the OWNER
// applies it — dash only draws the chip (decision 8).
//   all-in RPM ≥ target   → Tier 1
//              ≥ minimum  → Tier 2
//              ≥ walkAway → Tier 3
//              below      → "losing money — park?" (no tier)
// Ladder null → suggestion null (not 3): no ladder means no verdict.
import type { RateLadder } from "@/lib/metrics/rateTargets";

// The established-footprint gate (REL-01 §4): three delivered loads.
export const ESTABLISHED_AT = 3;

export const isEstablished = (deliveredCount: number): boolean =>
  deliveredCount >= ESTABLISHED_AT;

export type TierSuggestion = 1 | 2 | 3 | "below" | null;

const ladderReady = (
  ladder: RateLadder | null | undefined,
): ladder is RateLadder & { walkAway: number; minimum: number; target: number } =>
  ladder != null && ladder.walkAway != null && ladder.minimum != null && ladder.target != null;

export const suggestTier = (
  rpm: number | null,
  ladder: RateLadder | null | undefined,
): TierSuggestion => {
  if (rpm == null || !ladderReady(ladder)) return null;
  if (rpm >= ladder.target) return 1;
  if (rpm >= ladder.minimum) return 2;
  if (rpm >= ladder.walkAway) return 3;
  return "below";
};

export type BucketSuggestion =
  | "tier1"
  | "tier2"
  | "tier3"
  | "below"
  | "prospect"
  | "parked"
  | null;

// Where dash would put this agent. Established (≥3 delivered) → the band;
// not established → Prospect, or Parked when dormant. An agent the owner has
// parked stays parked — there is nothing to suggest over a human decision.
export const suggestBucket = (
  agent: { work_status?: "active" | "parked" },
  ctx: {
    deliveredCount: number;
    rpm: number | null;
    ladder: RateLadder | null | undefined;
    dormant: boolean;
  },
): BucketSuggestion => {
  if (agent.work_status === "parked") return "parked";
  if (isEstablished(ctx.deliveredCount)) {
    const t = suggestTier(ctx.rpm, ctx.ladder);
    if (t == null) return null;
    if (t === "below") return "below";
    return `tier${t}` as const;
  }
  return ctx.dormant ? "parked" : "prospect";
};

// Where an RPM sits on the ladder, in words — the evidence beside a
// suggestion ("$6.94 all-in · above Strong · 3 loads").
export const bandLabel = (
  rpm: number | null,
  ladder: RateLadder | null | undefined,
): string | null => {
  if (rpm == null || !ladderReady(ladder)) return null;
  if (ladder.strong != null && rpm >= ladder.strong) return "above Strong";
  if (rpm >= ladder.target) return "above Target";
  if (rpm >= ladder.minimum) return "above Minimum";
  if (rpm >= ladder.walkAway) return "above Walk-away";
  return "under Walk-away";
};

// The chip / button word for a suggestion.
export const suggestionLabel = (s: BucketSuggestion): string | null => {
  switch (s) {
    case "tier1":
      return "Tier 1";
    case "tier2":
      return "Tier 2";
    case "tier3":
      return "Tier 3";
    case "prospect":
      return "Prospect";
    case "parked":
      return "Parked";
    case "below":
      return "Losing money";
    default:
      return null;
  }
};
