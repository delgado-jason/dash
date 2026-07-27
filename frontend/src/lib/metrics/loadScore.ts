import { RATE_TIERS } from "@/lib/constants/targets";

// The "Take It or Leave It" load scorer. Judges ONE offered load by what it
// actually pays per mile you DRIVE (loaded + deadhead), against your real
// break-even per driven mile. Deadhead is baked into the headline on purpose —
// it's the cost agents leave out.
export type Verdict = "pass" | "meh" | "take" | "steal";

export interface ScoreInput {
  rate: number; // the all-in GROSS $ offered
  loadedMiles: number;
  deadheadMiles: number;
}

// From the trailing cost engine (getCostBasis).
export interface ScoreBasis {
  costPerDrivenMile: number | null; // net cost ÷ total (driven) miles
  payTake: number | null; // net ÷ gross — your blended keep after the carrier
}

export interface LoadScore {
  drivenMiles: number;
  allInRpm: number | null; // gross rate ÷ driven miles (the headline)
  breakevenRpm: number | null; // gross break-even ÷ driven mile
  pctOverBreakeven: number | null; // +0.36 = 36% over break-even
  net: number | null; // rate after the carrier's cut
  cost: number | null; // cost of the driven miles
  profit: number | null; // net − cost
  verdict: Verdict | null; // null when there's no cost basis yet
}

export const scoreLoad = (input: ScoreInput, basis: ScoreBasis): LoadScore => {
  const driven =
    (Number(input.loadedMiles) || 0) + (Number(input.deadheadMiles) || 0);
  const rate = Number(input.rate) || 0;
  const { costPerDrivenMile, payTake } = basis;

  const empty: LoadScore = {
    drivenMiles: driven,
    allInRpm: null,
    breakevenRpm: null,
    pctOverBreakeven: null,
    net: null,
    cost: null,
    profit: null,
    verdict: null,
  };

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
  else if (pctOverBreakeven < RATE_TIERS.target) verdict = "meh";
  else if (pctOverBreakeven < RATE_TIERS.strong) verdict = "take";
  else verdict = "steal";

  return {
    drivenMiles: driven,
    allInRpm,
    breakevenRpm,
    pctOverBreakeven,
    net,
    cost,
    profit,
    verdict,
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
): CounterRates | null => {
  if (breakevenRpm == null || breakevenRpm <= 0 || drivenMiles <= 0) return null;
  return {
    floor: breakevenRpm * drivenMiles,
    take: breakevenRpm * (1 + RATE_TIERS.target) * drivenMiles,
    steal: breakevenRpm * (1 + RATE_TIERS.strong) * drivenMiles,
  };
};

export const VERDICT_META: Record<
  Verdict,
  { label: string; fg: string; bg: string }
> = {
  pass: { label: "PASS", fg: "#f87171", bg: "#3a1a1a" },
  meh: { label: "MEH", fg: "#e8940a", bg: "#3a2a0a" },
  take: { label: "TAKE IT", fg: "#4ade80", bg: "#1a3a2a" },
  steal: { label: "STEAL", fg: "#fbbf24", bg: "#3a300a" },
};
