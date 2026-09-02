// The Rate Dial (Jason, 2026-09-02): rate tiers are SET in margin space —
// one slider per freight class picks the target margin you're pricing for,
// and the three rungs derive from it (target −5 / target / target +5 pts,
// the same grammar as the margin grade bands). The dial WRITES the same
// markup columns the Scorer and ladders have always read — markup and margin
// are two currencies for one number:
//   markup  = margin ÷ (1 − margin)   (what you add over break-even)
//   margin  = markup ÷ (1 + markup)   (what the rate yields on revenue)
// A +15% markup is only a 13% margin — the confusion this file retires.
import type { MarketDirection } from "./marketSignal";

const r4 = (n: number) => Math.round(n * 10000) / 10000;

export const marginToMarkup = (margin: number): number =>
  margin >= 1 ? Infinity : r4(margin / (1 - margin));

export const markupToMargin = (markup: number): number =>
  r4(markup / (1 + markup));

export interface DialRungs {
  // Margins (0–1): what each rung yields on revenue.
  margins: { minimum: number; target: number; strong: number };
  // Markups (0–1): what gets WRITTEN to the rate_tier_* columns.
  markups: { minimum: number; target: number; strong: number };
}

// Rungs from the slider's target margin. The minimum rung floors at 0%
// margin (break-even) — the dial never writes a below-break-even rung; the
// slider's red zone is a warning state, not a bookable tier.
export const dialRungs = (targetMargin: number): DialRungs => {
  const margins = {
    minimum: Math.max(0, r4(targetMargin - 0.05)),
    target: r4(targetMargin),
    strong: r4(targetMargin + 0.05),
  };
  return {
    margins,
    markups: {
      minimum: marginToMarkup(margins.minimum),
      target: marginToMarkup(margins.target),
      strong: marginToMarkup(margins.strong),
    },
  };
};

export interface DialAdvice {
  direction: MarketDirection;
  std: number; // recommended STANDARD dial position (target margin, 0–1)
  spec: number; // recommended SPECIALIZED position — std + your risk premium
  stdDelta: number; // rec − current (signed); |delta| < 0.01 reads as "hold"
  specDelta: number;
  hold: boolean; // both dials already within a point of the recommendation
  headline: string;
  why: string;
}

// Market-aware dial advice (Jason, 2026-09-02): a documented heuristic, not a
// feed — there is no external per-mile market rate, only the FRED index's
// direction. The recommendation anchors to the MARGIN GOAL, never to where
// the dial happens to sit:
//   softening → goal + 2 pts  (thin the padding, stay competitive — but the
//                              dial is never advised below the goal itself)
//   flat      → goal + 5 pts  (the house posture: price for strong,
//                              slippage lands on target)
//   firming   → goal + 8 pts  (the market is paying — take the extra)
// Specialized = standard + your existing risk premium (current spec − std
// target margins, floored at 5 pts), so advice preserves the spread you set.
// The dial's physical range — advice must never point past where the slider
// can actually go.
export const DIAL_MAX_MARGIN = 0.45;

export const dialAdvice = (
  direction: MarketDirection,
  marginGoal: number,
  currentStdMargin: number,
  currentSpecMargin: number,
): DialAdvice => {
  const bump = direction === "softening" ? 0.02 : direction === "firming" ? 0.08 : 0.05;
  const std = Math.min(DIAL_MAX_MARGIN, r4(marginGoal + bump)); // always clears the goal
  const premium = Math.max(0.05, r4(currentSpecMargin - currentStdMargin));
  const spec = Math.min(DIAL_MAX_MARGIN, r4(std + premium));
  const stdDelta = r4(std - currentStdMargin);
  const specDelta = r4(spec - currentSpecMargin);
  const hold = Math.abs(stdDelta) < 0.01 && Math.abs(specDelta) < 0.01;

  const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
  const headline = hold
    ? `Hold your dials — you're already priced for this market`
    : direction === "softening"
      ? `Market softening — consider Standard at ${pct(std)}`
      : direction === "firming"
        ? `Market firming — push Standard to ${pct(std)}`
        : `Flat market — the house posture is ${pct(std)}`;
  const why =
    direction === "softening"
      ? `Thin the padding to stay competitive, but never price under your ${pct(marginGoal)} goal — win the slow market on volume, not on losses.`
      : direction === "firming"
        ? `The board is paying — widen the padding while it lasts. Specialized keeps your ${pct(premium)} risk premium on top.`
        : `Price ${pct(0.05)} above your ${pct(marginGoal)} goal so normal slippage lands on it, not under it.`;

  return { direction, std, spec, stdDelta, specDelta, hold, headline, why };
};
