// THE CALL — one engine, one move per tier (Jason, 2026-11-01, the numbers
// audit, nodded): the dial advice, the playbook and the tier gauge used to be
// three rules on four windows that contradicted each other on the same day,
// and one load could set a tier's call. Now each tier is judged on ITS OWN
// freight type only — the median of at least MIN_LOADS_TO_CALL loads of that
// type in the window against that tier's own rungs — and the index may nudge
// it ONE STEP, only when the signal holds (two prints running, not a fuel
// move). Where your rungs sit among your own accepted loads is evidence
// shown beside the call, labelled as your accepted loads, never "the market";
// when that evidence and the index disagree, the engine says so and holds.
// Everything is gross $/driven mile, the ladders' own basis.
import type { RateLadder } from "./rateTargets";
import { windowRates, median, percentileOf, MIN_LOADS_FOR_PCTILE, type RatePoint } from "./marketAnalytics";
import type { MarketSignal } from "./marketSignal";

export const MIN_LOADS_TO_CALL = 5;
// The tier's target among its own accepted loads: under this share it clears
// easily (your loads say "hot"); over this it is barely gettable.
export const PCTILE_EASY = 0.45;
export const PCTILE_HARD = 0.7;

export type TierKey = "standard" | "specialized";
export type CallAction = "raise" | "hold" | "protect" | "below-breakeven" | "cut-costs" | "no-call";

export interface Rung {
  // The ladder's own words since 2026-11-12. This rung was called "floor"
  // here and "minimum" everywhere else in dash — one number, two names, on
  // pages that link to each other.
  key: "prime" | "target" | "minimum" | "breakEven";
  label: string;
  rate: number; // gross $/driven mile
  deltaPct: number; // signed % move from your median to reach this rung
}

export interface TierEvidence {
  n: number; // loads of this type in the window
  below: number; // of them under break-even
  pctile: number | null; // the tier's target among this type's accepted loads — null under MIN_LOADS_FOR_PCTILE
  disagree: boolean; // the index and your own loads point opposite ways — the engine held
}

export interface TierCall {
  key: TierKey;
  label: string;
  yourRate: number | null; // your recent median (gross $/driven mile)
  rungs: Rung[]; // prime → target → minimum → break-even (high to low)
  action: CallAction;
  headline: string;
  why: string;
  movePct: number | null; // the recommended move (signed); null when there isn't one
  recommendedRate: number | null;
  underwaterPerMile: number | null; // action "cut-costs" / "below-breakeven": $/mi below break-even
  evidence: TierEvidence;
}

export interface MarketCall {
  signal: MarketSignal | null;
  windowDays: number;
  tiers: TierCall[]; // [standard, specialized]
}

const signed = (x: number): string => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;
const absPct = (x: number): string => `${Math.round(Math.abs(x) * 100)}%`;
const usd = (x: number): string => `$${x.toFixed(2)}`;
const pctMove = (from: number, to: number): number => (from > 0 ? (to - from) / from : 0);
const pct1 = (x: number): string => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

// What the index is allowed to say right now, in one clause.
export const indexWord = (s: MarketSignal | null): string => {
  if (!s) return "no index read";
  if (s.fuelDriven)
    return `the index's ${s.pctChange >= 0 ? "rise" : "fall"} (${pct1(s.pctChange)}) is diesel's (${pct1(s.dieselPct ?? 0)}) — a fuel move, not a rate move`;
  if (s.raw === "flat") return `the index is steady (${pct1(s.pctChange)} over three months)`;
  if (!s.holds) return `one print of ${s.raw} (${pct1(s.pctChange)}) — not yet a call; the rule waits for two`;
  return `the index has been ${s.raw} for ${s.prints} prints running (${pct1(s.pctChange)})`;
};

// One tier's call. Pure: this type's own recent rates, its ladder and the
// signal in — a single call with its evidence out.
export const buildTierCall = (
  key: TierKey,
  label: string,
  ladder: RateLadder,
  rates: number[],
  signal: MarketSignal | null,
  businessUnderwater = false,
): TierCall => {
  const n = rates.length;
  const yourRate = median(rates);
  const be = ladder.breakEven;
  const minimum = ladder.minimum;
  const target = ladder.target;
  const prime = ladder.prime;
  const lower = label.toLowerCase();
  const below = be != null ? rates.filter((r) => r < be).length : 0;
  const pctile = target != null && n >= MIN_LOADS_FOR_PCTILE ? percentileOf(rates, target) : null;
  const evidence: TierEvidence = { n, below, pctile, disagree: false };

  const base: TierCall = {
    key, label, yourRate, rungs: [], action: "no-call", headline: "No call", why: "", movePct: null,
    recommendedRate: null, underwaterPerMile: null, evidence,
  };
  if (be == null || minimum == null || target == null || prime == null) {
    return {
      ...base,
      headline: "No cost basis yet",
      why: yourRate != null
        ? `You've got a rate read (${usd(yourRate)}, ${n} loads), but no cost basis yet — file a P&L month so your rungs can be placed.`
        : "File a P&L month so your rungs can be placed.",
    };
  }
  const rungs: Rung[] = yourRate == null ? [] : [
    { key: "prime", label: "Prime", rate: prime, deltaPct: pctMove(yourRate, prime) },
    { key: "target", label: "Target", rate: target, deltaPct: pctMove(yourRate, target) },
    { key: "minimum", label: "Minimum", rate: minimum, deltaPct: pctMove(yourRate, minimum) },
    { key: "breakEven", label: "Break-even", rate: be, deltaPct: pctMove(yourRate, be) },
  ];
  const withRungs = { ...base, rungs };
  if (n === 0 || yourRate == null) {
    return { ...withRungs, headline: "No loads in range", why: `No delivered ${lower} loads in the last 90 days to read a rate.` };
  }
  if (n < MIN_LOADS_TO_CALL) {
    return {
      ...withRungs,
      headline: "Not enough to call",
      why: `${n} ${lower} load${n === 1 ? "" : "s"} in 90 days — the engine wants ${MIN_LOADS_TO_CALL} of one type before it calls a move. Here is where the ${n === 1 ? "one you ran sits" : "ones you ran sit"}.`,
    };
  }

  const dir = signal?.direction ?? "flat";
  const idx = indexWord(signal);
  const loadsWord = `${n} ${lower} loads`;

  // Below break-even beats every direction. A single cheap tier under the
  // blended line while the business is profitable is subsidized freight —
  // a mix nudge, not the alarm. Only a whole operation under water is.
  if (yourRate < be) {
    if (businessUnderwater) {
      return {
        ...withRungs, action: "cut-costs", headline: "Cut costs",
        why: `Your whole operation is booking below break-even (${usd(be)}) — ${below} of ${loadsWord} ran under it. Cut costs or take home time; don't chase loads at this rate.`,
        underwaterPerMile: be - yourRate,
      };
    }
    return {
      ...withRungs, action: "below-breakeven", headline: "Below break-even — don't chase lower",
      why: `Your ${lower} median (${usd(yourRate)}, ${loadsWord}) runs under break-even (${usd(be)}) — ${below} of them did. These loads lean on your richer freight; they aren't losing you money. Lift this tier toward your minimum (${usd(minimum)}) or fill the miles with better freight.`,
      movePct: pctMove(yourRate, minimum), recommendedRate: minimum, underwaterPerMile: be - yourRate,
    };
  }

  // Between break-even and your minimum: hold the line, whatever the index says.
  if (yourRate < minimum) {
    return {
      ...withRungs, action: "protect", headline: `Hold the line at your minimum (${usd(minimum)})`,
      why: `Your median (${usd(yourRate)}, ${loadsWord}) sits between break-even (${usd(be)}) and your minimum — ${absPct(pctMove(yourRate, be))} above break-even. Book to the minimum; ${idx}.`,
      recommendedRate: minimum,
    };
  }

  // The index may nudge one step — and your own loads may veto it.
  const hard = pctile != null && pctile >= PCTILE_HARD;
  const easy = pctile != null && pctile < PCTILE_EASY;
  const pctWord = pctile != null ? `${Math.round(pctile * 100)}% of your recent ${lower} loads sat at or under your target` : null;
  if (dir === "firming" && hard) {
    return {
      ...withRungs, action: "hold", headline: "Evidence disagrees — hold",
      why: `${idx.charAt(0).toUpperCase()}${idx.slice(1)}, but ${pctWord} — the target is already hard to hit on your own freight. Hold at ${usd(yourRate)} rather than raise into a rate your loads don't show.`,
      evidence: { ...evidence, disagree: true },
    };
  }
  if (dir === "softening" && easy) {
    return {
      ...withRungs, action: "hold", headline: "Evidence disagrees — hold",
      why: `${idx.charAt(0).toUpperCase()}${idx.slice(1)}, but only ${pctWord} — your own loads clear the target easily. Hold; don't trim toward an index your freight isn't following.`,
      evidence: { ...evidence, disagree: true },
    };
  }

  if (yourRate < target) {
    if (dir === "firming") {
      const move = pctMove(yourRate, target);
      return {
        ...withRungs, action: "raise", headline: `Raise ${signed(move)} to your target`,
        why: `${idx.charAt(0).toUpperCase()}${idx.slice(1)}. One step: from ${usd(yourRate)} (${loadsWord}) to your target (${usd(target)}) — not to prime; the next step waits for the next held print.`,
        movePct: move, recommendedRate: target,
      };
    }
    if (dir === "softening") {
      const cushion = pctMove(yourRate, minimum); // negative
      return {
        ...withRungs, action: "protect", headline: `Hold — ${absPct(cushion)} cushion to your minimum`,
        why: `${idx.charAt(0).toUpperCase()}${idx.slice(1)}. Hold as high as you can; you've got ${absPct(cushion)} down to your minimum (${usd(minimum)}) before the edge — never below it.`,
      };
    }
    return {
      ...withRungs, action: "hold", headline: "Hold — between minimum and target",
      why: `Your median (${usd(yourRate)}, ${loadsWord}) sits between your minimum (${usd(minimum)}) and target (${usd(target)}); ${idx}. Quote to target where the load allows; the engine moves the rung only on a held signal.`,
    };
  }

  // At or above target.
  if (dir === "firming") {
    if (yourRate >= prime) {
      return {
        ...withRungs, action: "raise", headline: "Push the ceiling",
        why: `${idx.charAt(0).toUpperCase()}${idx.slice(1)}, and you're already at your prime rung (${usd(prime)}) on ${loadsWord}. Quote higher and hold firm.`,
        recommendedRate: prime,
      };
    }
    const move = pctMove(yourRate, prime);
    return {
      ...withRungs, action: "raise", headline: `Push ${signed(move)} to your prime rung`,
      why: `${idx.charAt(0).toUpperCase()}${idx.slice(1)}. You're at or above target (${usd(yourRate)}, ${loadsWord}) — one step up is your prime rung (${usd(prime)}).`,
      movePct: move, recommendedRate: prime,
    };
  }
  if (dir === "softening") {
    return {
      ...withRungs, action: "hold", headline: "Hold — above target",
      why: `${idx.charAt(0).toUpperCase()}${idx.slice(1)}, but you're at or above target (${usd(yourRate)}, ${loadsWord}). Don't chase it down; your minimum is ${usd(minimum)}.`,
    };
  }
  return {
    ...withRungs, action: "hold", headline: "Hold — at or above target",
    why: `Your median (${usd(yourRate)}, ${loadsWord}) is at or above your target (${usd(target)}); ${idx}. Hold your rate.`,
  };
};

// The whole call: each tier on its own type's recent loads (Standard = the
// "standard" bucket; Specialized folds in specialized + hazmat), the ladders,
// the signal → one call per tier.
export const buildMarketCall = (
  points: RatePoint[],
  stdLadder: RateLadder,
  specLadder: RateLadder,
  signal: MarketSignal | null,
  now: Date,
  // Is the WHOLE operation booking below break-even? (blended gross/driven mile
  // < break-even-to-book.) Gates "cut-costs"; a single cheap tier under the
  // line while this is false is subsidized freight, not a loss.
  businessUnderwater = false,
  windowDays = 90,
): MarketCall => {
  const std = windowRates(points.filter((p) => p.bucket === "standard"), now, windowDays);
  const spec = windowRates(points.filter((p) => p.bucket !== "standard"), now, windowDays);
  return {
    signal,
    windowDays,
    tiers: [
      buildTierCall("standard", "Standard flatbed", stdLadder, std, signal, businessUnderwater),
      buildTierCall("specialized", "Specialized / oversize", specLadder, spec, signal, businessUnderwater),
    ],
  };
};
