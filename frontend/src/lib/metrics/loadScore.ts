import { RATE_TIERS, type RateTiers } from "@/lib/constants/targets";

// The "Take It or Leave It" load scorer. Judges ONE offered load by what it
// actually pays per mile you DRIVE (loaded + deadhead), against your real
// break-even per driven mile. Deadhead is baked into the headline on purpose —
// it's the cost agents leave out.
/**
 * FIVE verdicts, one per rung — the fifth added 2026-11-12 (Rule change:
 * SCORE-01).
 *
 * The old logic read the ladder's `minimum` rung nowhere: it jumped from
 * break-even straight to `target`, so everything between them was "THIN". On
 * Jason's own book that mislabelled **five of fifty delivered loads** — loads
 * that cleared his minimum, which IS his 15% margin goal, and were told they
 * earned him nothing. "Profitable" and "barely covers the truck" are not the
 * same answer and must not share a word.
 *
 * The keys are deliberately unchanged from the 2026-11 Steel-grade rework,
 * apart from the new `profit`: they are persisted in no table but they are read
 * by several panels, and renaming them buys nothing a label change doesn't.
 * `pass < meh < profit < take < steal`, worst to best.
 */
export type Verdict = "pass" | "meh" | "profit" | "take" | "steal";

/**
 * Worst to best. Anything that draws a scale of the verdicts reads this rather
 * than hard-coding an order — the gauge on the Scorer used to carry its own
 * four stripes and drifted the moment a fifth verdict appeared.
 */
export const VERDICT_ORDER: readonly Verdict[] = ["pass", "meh", "profit", "take", "steal"];

/**
 * Is `v` at least as good as `floor`?
 *
 * Use this instead of writing `v === "take" || v === "steal"`. Adding the fifth
 * verdict broke exactly such a list — the Scorer's "is there room to counter?"
 * test enumerated `pass` and `meh`, so a `profit` load fell through it and the
 * page told Jason a rate 5 points under target "already clears your target".
 * An enumeration silently excludes whatever is added next; a comparison does
 * not. Null (no basis, unknown input) is never "at or above" anything.
 */
export const verdictAtLeast = (v: Verdict | null, floor: Verdict): boolean =>
  v != null && VERDICT_ORDER.indexOf(v) >= VERDICT_ORDER.indexOf(floor);

export interface ScoreInput {
  rate: number | null; // the all-in GROSS $ offered
  loadedMiles: number | null;
  // null = unknown (no odometer, nothing typed). Never 0: zero is "the truck is
  // already at the shipper", a real answer; unknown is a refusal to grade.
  deadheadMiles: number | null;
}

// A number when the value is a real, finite number; null for null/undefined/
// blank/NaN. Zero stays zero.
export const knownNumber = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export const DEADHEAD_UNKNOWN = "deadhead unknown — needs the odometer";

// From the trailing cost engine (getCostBasis).
export interface ScoreBasis {
  costPerDrivenMile: number | null; // net cost ÷ total (driven) miles
  payTake: number | null; // net ÷ gross — your blended keep after the carrier
  /**
   * The cost a mile incurs by being driven — fuel, tyres, wear. Optional:
   * without it the Scorer grades exactly as it always did, it simply cannot
   * say whether a load below break-even still beats parking.
   */
  variablePerMile?: number | null;
}

export interface LoadScore {
  drivenMiles: number;
  allInRpm: number | null; // gross rate ÷ driven miles (the headline)
  loadedRpm: number | null; // gross rate ÷ LOADED miles — the freight's own rate, deadhead-blind (for the "why it's THIN" diagnosis, never the verdict)
  breakevenRpm: number | null; // gross break-even ÷ driven mile
  pctOverBreakeven: number | null; // +0.36 = 36% over break-even
  net: number | null; // rate after the carrier's cut
  cost: number | null; // cost of the driven miles
  profit: number | null; // net − cost
  verdict: Verdict | null; // null when there's no cost basis yet, or an input is unknown
  missing: string[]; // what the Scorer refused to guess ("deadhead unknown — needs the odometer")
  /**
   * The gross rate per driven mile at which moving stops being worse than
   * parking: the point where what a mile brings home covers what it burns.
   *
   * IT IS NOT A TARGET, and it is roughly HALF the break-even. The break-even
   * answers "what must the month average?"; this answers the different and
   * much narrower question "the alternative right now is sitting still — is
   * this better than that?". Fixed cost is absent on purpose: it drafts
   * whether the truck rolls or not, so it cannot decide a marginal load.
   *
   * Fill a month with freight at this rate and the month is a disaster. Take
   * ONE to get out of a dead market and you are better off than idling.
   */
  beatsSittingRpm: number | null;
  /** Whether this load clears that line. Null when it cannot be worked out. */
  beatsSitting: boolean | null;
}

export const scoreLoad = (
  input: ScoreInput,
  basis: ScoreBasis,
  tiers: RateTiers = RATE_TIERS,
): LoadScore => {
  const loadedK = knownNumber(input.loadedMiles);
  const deadK = knownNumber(input.deadheadMiles);
  const rateK = knownNumber(input.rate);
  const missing: string[] = [];
  if (rateK == null) missing.push("rate unknown — type what it pays");
  if (loadedK == null) missing.push("loaded miles unknown — needs the route");
  if (deadK == null) missing.push(DEADHEAD_UNKNOWN);
  // Driven miles are only a number when BOTH legs are known.
  const driven = loadedK != null && deadK != null ? loadedK + deadK : 0;
  const rate = rateK == null ? NaN : rateK; // not used while a rate is missing (we return before the math)
  const loadedRpm = rateK != null && loadedK != null && loadedK > 0 ? rateK / loadedK : null; // freight's own rate
  const { costPerDrivenMile, payTake, variablePerMile = null } = basis;

  // Where moving stops being worse than parking: gross x keep must cover what
  // the mile burns, so gross = variable / keep. Needs no rate and no miles, so
  // it is known even when the load itself cannot be graded.
  const beatsSittingRpm =
    variablePerMile != null && variablePerMile > 0 && payTake != null && payTake > 0
      ? variablePerMile / payTake
      : null;

  const empty: LoadScore = {
    drivenMiles: driven,
    allInRpm: null,
    loadedRpm,
    breakevenRpm: null,
    pctOverBreakeven: null,
    net: null,
    cost: null,
    profit: null,
    verdict: null,
    missing,
    beatsSittingRpm,
    beatsSitting: null,
  };

  // Unknown input → no grade, no numbers built on a guess.
  if (missing.length) return empty;

  // Need miles and a calibrated cost basis to score anything.
  if (
    driven <= 0 ||
    costPerDrivenMile == null ||
    costPerDrivenMile <= 0 ||
    payTake == null ||
    payTake <= 0
  )
    return empty;

  const allInRpm = rate / driven; // gross per driven mile
  const breakevenRpm = costPerDrivenMile / payTake; // gross break-even per driven mile
  const pctOverBreakeven = allInRpm / breakevenRpm - 1;
  const net = rate * payTake;
  const cost = driven * costPerDrivenMile;
  const profit = net - cost;

  // One band per rung, in order. The `minimum` line is the one the old four-way
  // ladder skipped (Rule change: SCORE-01) — above it a load clears the margin
  // goal the minimum rung was derived from, which is a different fact from
  // "covers the truck and nothing more".
  //
  // BANDED ON A ROUNDED PERCENTAGE, and this is not fussiness. `counterRates`
  // hands back the exact dollars a rung needs; price a load at that figure and
  // the round trip through rate ÷ miles ÷ break-even lands on 0.1499999999999999
  // instead of 0.15, dropping the load a whole band. The page would tell Jason
  // to ask $7,655 to clear his minimum and then call $7,655 THIN. Six decimals
  // is four orders of magnitude finer than any rate the page displays, so the
  // only thing it can change is the float dirt. Same reasoning as the margin
  // bands' r4() in playerCard.ts. The raw value is still what gets reported.
  const band = Math.round(pctOverBreakeven * 1e6) / 1e6;
  let verdict: Verdict;
  if (band < 0) verdict = "pass";
  else if (band < tiers.minimum) verdict = "meh";
  else if (band < tiers.target) verdict = "profit";
  else if (band < tiers.prime) verdict = "take";
  else verdict = "steal";

  return {
    drivenMiles: driven,
    allInRpm,
    loadedRpm,
    breakevenRpm,
    pctOverBreakeven,
    net,
    cost,
    profit,
    verdict,
    missing,
    beatsSittingRpm,
    beatsSitting: beatsSittingRpm == null ? null : allInRpm >= beatsSittingRpm,
  };
};

export interface CounterRates {
  floor: number; // break-even rate for these miles — a loss below it
  minimum: number; // rate that clears the minimum rung (the margin goal)
  take: number; // rate that reaches the target rung
  steal: number; // rate that reaches the prime rung
}

// What to counter with: every rung priced on THIS load's driven miles, from the
// same break-even and tiers the verdict uses. null without a cost basis.
//
// `minimum` joined the three others on 2026-11-12 — the verdict reads that rung
// now, so a counter-offer table that omitted it could not name the rate the page
// had just graded against. Jason's ask, in his words: "if the rate is lower, I
// know what to ask for to be right where I want to be on that load."
export const counterRates = (
  breakevenRpm: number | null,
  drivenMiles: number,
  tiers: RateTiers = RATE_TIERS,
): CounterRates | null => {
  if (breakevenRpm == null || breakevenRpm <= 0 || drivenMiles <= 0) return null;
  return {
    floor: breakevenRpm * drivenMiles,
    minimum: breakevenRpm * (1 + tiers.minimum) * drivenMiles,
    take: breakevenRpm * (1 + tiers.target) * drivenMiles,
    steal: breakevenRpm * (1 + tiers.prime) * drivenMiles,
  };
};

// One label per rung. SCRAP became BELOW COST on 2026-11-12: "scrap" is a
// judgement about the freight, and what the page actually knows is an
// arithmetic fact about the money. Jason's brief was that no label should leave
// room for "the vague idea of whether the load is profitable or not".
export const VERDICT_META: Record<
  Verdict,
  { label: string; fg: string; bg: string }
> = {
  pass: { label: "BELOW COST", fg: "var(--color-status-negative-text)", bg: "var(--color-status-negative-bg)" }, // under break-even — you pay to haul it
  meh: { label: "THIN", fg: "var(--color-amber-hi)", bg: "var(--color-status-aware-bg)" }, // covers the truck, earns nothing
  profit: { label: "PROFITABLE", fg: "var(--color-cat2)", bg: "color-mix(in srgb, var(--color-cat2) 14%, transparent)" }, // clears the minimum rung = the margin goal
  take: { label: "SOLID", fg: "var(--color-cat2)", bg: "color-mix(in srgb, var(--color-cat2) 14%, transparent)" }, // clears your target
  steal: { label: "PRIME", fg: "var(--color-hot)", bg: "var(--color-status-aware-bg)" }, // clears your prime rung
};
