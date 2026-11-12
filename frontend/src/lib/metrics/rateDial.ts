// The Rate Dial (Jason, 2026-09-02): rate tiers are SET in margin space —
// one slider per freight class picks the target margin you're pricing for,
// and the three rungs derive from it (target −5 / target / target +5 pts,
// the same grammar as the margin grade bands). The dial WRITES the same
// markup columns the Scorer and ladders have always read — markup and margin
// are two currencies for one number:
//   markup  = margin ÷ (1 − margin)   (what you add over break-even)
//   margin  = markup ÷ (1 + markup)   (what the rate yields on revenue)
// A +15% markup is only a 13% margin — the confusion this file retires.
import type { MarketDirection, MarketSignal } from "./marketSignal";

const r4 = (n: number) => Math.round(n * 10000) / 10000;

export const marginToMarkup = (margin: number): number =>
  margin >= 1 ? Infinity : r4(margin / (1 - margin));

export const markupToMargin = (markup: number): number =>
  r4(markup / (1 + markup));

export interface DialRungs {
  // Margins (0–1): what each rung yields on revenue.
  margins: { minimum: number; target: number; prime: number };
  // Markups (0–1): what gets WRITTEN to the rate_tier_* columns.
  markups: { minimum: number; target: number; prime: number };
}

// Rungs from the slider's target margin. The minimum rung floors at 0%
// margin (break-even) — the dial never writes a below-break-even rung; the
// slider's red zone is a warning state, not a bookable tier.
export const dialRungs = (targetMargin: number): DialRungs => {
  const margins = {
    minimum: Math.max(0, r4(targetMargin - 0.05)),
    target: r4(targetMargin),
    prime: r4(targetMargin + 0.05),
  };
  return {
    margins,
    markups: {
      minimum: marginToMarkup(margins.minimum),
      target: marginToMarkup(margins.target),
      prime: marginToMarkup(margins.prime),
    },
  };
};

export interface DialAdvice {
  direction: MarketDirection; // the signal's usable direction (flat when it doesn't hold)
  std: number; // recommended STANDARD dial position (target margin, 0–1)
  spec: number; // recommended SPECIALIZED position — std + your risk premium
  stdDelta: number; // rec − current (signed); |delta| < 0.01 reads as "hold"
  specDelta: number;
  hold: boolean; // both dials already within a point of the recommendation
  prints: number; // consecutive prints agreeing with the raw read
  fuelDriven: boolean; // the index's move is diesel's
  headline: string;
  why: string;
}

// The dial's nudge from the index alone (Jason, 2026-11-01: "I will move the
// dial only after two to three agreeing months"). A documented rule, not a
// feed: when the signal HOLDS (two prints running, not a fuel move) it nudges
// the Standard dial ONE STEP — two points — from where it sits; otherwise it
// says hold and why. It never points under goal + 5, so the floor rung (target
// − 5) never lands under the goal the copy promises to protect, and never past
// the slider's range. Specialized keeps your risk premium (current spec − std,
// floored at 5 pts) on top.
export const DIAL_MAX_MARGIN = 0.45;
export const DIAL_STEP = 0.02;

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

export const dialAdvice = (
  signal: MarketSignal | null,
  marginGoal: number,
  currentStdMargin: number,
  currentSpecMargin: number,
): DialAdvice => {
  const floor = r4(marginGoal + 0.05);
  const premium = Math.max(0.05, r4(currentSpecMargin - currentStdMargin));
  const direction: MarketDirection = signal?.direction ?? "flat";
  const prints = signal?.prints ?? 0;
  const fuelDriven = signal?.fuelDriven ?? false;

  // The dial parked under goal + 5 is a correction, not a nudge: its floor
  // rung sits under the goal. That reads first, whatever the index says.
  const underFloor = currentStdMargin < floor - 0.0001;
  let std = underFloor ? floor : currentStdMargin;
  if (direction === "firming") std = Math.max(floor, currentStdMargin + DIAL_STEP);
  if (direction === "softening") std = Math.max(floor, currentStdMargin - DIAL_STEP);
  std = r4(Math.min(DIAL_MAX_MARGIN, std));
  const spec = r4(Math.min(DIAL_MAX_MARGIN, std + premium));
  const stdDelta = r4(std - currentStdMargin);
  const specDelta = r4(spec - currentSpecMargin);
  const hold = Math.abs(stdDelta) < 0.01 && Math.abs(specDelta) < 0.01;

  const printsWord = `${prints} print${prints === 1 ? "" : "s"}`;
  let headline: string;
  let why: string;
  if (underFloor && direction !== "firming") {
    headline = `Under goal + 5 — lift Standard to ${pct(std)}`;
    why = `Your Standard dial sits at ${pct(currentStdMargin)}, under goal + 5 (${pct(floor)}), so its floor rung lands under your ${pct(marginGoal)} goal. Lift it to ${pct(floor)} first; the index's nudges start from there.`;
  } else if (!signal) {
    headline = "Hold your dials — no index read";
    why = "No freight-index read to lean on. Your dials stay where you set them.";
  } else if (fuelDriven) {
    headline = "Hold your dials — a fuel move, not a rate move";
    why = `The index moved ${signal.pctChange >= 0 ? "+" : ""}${pct(signal.pctChange)} over three months while diesel moved ${signal.dieselPct != null && signal.dieselPct >= 0 ? "+" : ""}${pct(signal.dieselPct ?? 0)} the same way. Your surcharge passes fuel through at 100% — there's no margin in it to chase.`;
  } else if (signal.raw !== "flat" && !signal.holds) {
    headline = `Hold your dials — ${signal.raw} for ${printsWord}, not yet a call`;
    why = `One print says ${signal.raw}; the rule waits for two in a row before it nudges a dial, and you move only after two or three. Check back next print.`;
  } else if (direction === "flat") {
    headline = "Hold your dials — the index is steady";
    why = `The index moved less than ${pct(0.025)} over three months. Nothing to react to.`;
  } else if (hold) {
    headline = `Hold your dials — already a step past where the index points`;
    why = `The index has been ${direction} for ${printsWord}, but your dials already sit where one step would put them.`;
  } else if (direction === "firming") {
    headline = `Firming for ${printsWord} — one step up: Standard to ${pct(std)}`;
    why = `Two points, not a leap: the rule moves one step per held signal. Specialized keeps your ${pct(premium)} premium on top.`;
  } else {
    headline = `Softening for ${printsWord} — one step down: Standard to ${pct(std)}`;
    why = `Thin the padding by one step, never under goal + 5 (${pct(floor)}) so your floor rung stays at your ${pct(marginGoal)} goal. Win a slow market on volume, not on losses.`;
  }
  return { direction, std, spec, stdDelta, specDelta, hold, prints, fuelDriven, headline, why };
};
