import { RATE_TIERS, type RateTiers } from "@/lib/constants/targets";

// The "Take It or Leave It" load scorer. Judges ONE offered load by what it
// actually pays per mile you DRIVE (loaded + deadhead), against your real
// break-even per driven mile. Deadhead is baked into the headline on purpose —
// it's the cost agents leave out.
export type Verdict = "pass" | "meh" | "take" | "steal";

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
   * IT IS NOT A TARGET, and it is roughly HALF the walk-away. The walk-away
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

  let verdict: Verdict;
  if (allInRpm < breakevenRpm) verdict = "pass";
  else if (pctOverBreakeven < tiers.target) verdict = "meh";
  else if (pctOverBreakeven < tiers.strong) verdict = "take";
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
  take: number; // rate that reaches TAKE IT (target tier)
  steal: number; // rate that reaches STEAL (strong tier)
}

// What to counter with when a load comes in under target: the break-even floor,
// the TAKE-IT rate, and the STEAL rate — priced on THIS load's driven miles from
// the same break-even and tiers the verdict uses. null without a cost basis.
export const counterRates = (
  breakevenRpm: number | null,
  drivenMiles: number,
  tiers: RateTiers = RATE_TIERS,
): CounterRates | null => {
  if (breakevenRpm == null || breakevenRpm <= 0 || drivenMiles <= 0) return null;
  return {
    floor: breakevenRpm * drivenMiles,
    take: breakevenRpm * (1 + tiers.target) * drivenMiles,
    steal: breakevenRpm * (1 + tiers.strong) * drivenMiles,
  };
};

// Forge "Steel grade" verdicts (retired the comic-noir PASS/MEH/TAKE IT/STEAL).
// Keys are unchanged so the scoring logic and every call site keep working.
export const VERDICT_META: Record<
  Verdict,
  { label: string; fg: string; bg: string }
> = {
  pass: { label: "SCRAP", fg: "var(--color-status-negative-text)", bg: "var(--color-status-negative-bg)" }, // below break-even — loses money
  meh: { label: "THIN", fg: "var(--color-amber-hi)", bg: "var(--color-status-aware-bg)" }, // above break-even, under target
  take: { label: "SOLID", fg: "var(--color-cat2)", bg: "color-mix(in srgb, var(--color-cat2) 14%, transparent)" }, // clears your target
  steal: { label: "PRIME", fg: "var(--color-hot)", bg: "var(--color-status-aware-bg)" }, // clears your strong tier
};
