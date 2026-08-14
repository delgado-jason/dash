import type { RateLadder } from "./rateTargets";
import type { MarketDirection } from "./marketSignal";
import { windowRates, median, type RatePoint } from "./marketAnalytics";

// The market playbook, per rate tier. Given the market's DIRECTION (from the FRED
// freight index) and where your recent rate sits against your OWN rungs, it gives
// the single move to make. There is no external per-mile "market rate" feed —
// your read is your recent median rate + the index's direction, and your rungs
// (break-even / floor / target / strong) are the guardrails. Everything is on the
// same gross-$/driven-mile basis as the barometer and scatter, so nothing is
// compared across bases. Rate math only — the cost-cut planner is separate.

export type PlaybookAction = "raise" | "hold" | "protect" | "cut-costs";

export interface Rung {
  key: "strong" | "target" | "floor" | "breakEven";
  label: string;
  rate: number; // gross $/driven mile
  deltaPct: number; // signed % move from your current rate to reach this rung
}

export interface TierPlay {
  key: "standard" | "specialized";
  label: string;
  yourRate: number | null; // your recent median (gross $/driven mile)
  rungs: Rung[]; // strong → target → floor → break-even (high to low)
  action: PlaybookAction;
  headline: string; // the one clear call, e.g. "Raise +23%"
  movePct: number | null; // the recommended move (signed); null when hold/protect
  recommendedRate: number | null; // the rate to aim for
  why: string;
  underwaterPerMile: number | null; // action "cut-costs": $/mi below break-even
}

const signed = (x: number): string => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;
const absPct = (x: number): string => `${Math.round(Math.abs(x) * 100)}%`;
const usd = (x: number): string => `$${x.toFixed(2)}`;
const pctMove = (from: number, to: number): number => (from > 0 ? (to - from) / from : 0);

// One tier's play. Pure: rungs + your recent rate + the index direction in, a
// single recommendation out.
export const buildTierPlay = (
  key: "standard" | "specialized",
  label: string,
  ladder: RateLadder,
  yourRate: number | null,
  direction: MarketDirection | null,
): TierPlay => {
  const be = ladder.walkAway;
  const floor = ladder.minimum;
  const target = ladder.target;
  const strong = ladder.strong;

  const base: TierPlay = {
    key,
    label,
    yourRate,
    rungs: [],
    action: "hold",
    headline: "—",
    movePct: null,
    recommendedRate: null,
    why: "Not enough data for this tier yet.",
    underwaterPerMile: null,
  };
  // Two distinct degraded causes — name each honestly instead of blaming
  // "rate history" for both. The card shows `why` whenever rungs is empty.
  if (yourRate == null || yourRate <= 0) {
    return { ...base, why: `No delivered ${label.toLowerCase()} loads in range yet to read a rate.` };
  }
  if (be == null || floor == null || target == null || strong == null) {
    return {
      ...base,
      why: `You've got a rate read (${usd(yourRate)}), but no cost basis yet — add a P&L month so your rungs can be placed.`,
    };
  }

  const rungs: Rung[] = [
    { key: "strong", label: "Strong", rate: strong, deltaPct: pctMove(yourRate, strong) },
    { key: "target", label: "Target", rate: target, deltaPct: pctMove(yourRate, target) },
    { key: "floor", label: "Floor", rate: floor, deltaPct: pctMove(yourRate, floor) },
    { key: "breakEven", label: "Break-even", rate: be, deltaPct: pctMove(yourRate, be) },
  ];
  const withRungs = { ...base, rungs };

  // Below break-even beats every direction — you're losing money on every mile.
  if (yourRate < be) {
    return {
      ...withRungs,
      action: "cut-costs",
      headline: "Cut costs",
      why: `You're booking below break-even (${usd(be)}). Holding rate means sitting; booking means losing money — cut costs or take home time, don't chase the load.`,
      underwaterPerMile: be - yourRate,
    };
  }

  // No index reading (FRED down, or the transient state before the async fetch
  // resolves): don't fabricate a market call. Show where you sit, hold to your
  // own targets. Below-break-even was already handled above and still wins.
  if (direction == null) {
    return {
      ...withRungs,
      action: "hold",
      headline: "Hold to your targets",
      why: `No freight-index read to lean on right now. Here's where your rate sits against your rungs — book to your own targets (${usd(target)}+), don't chase a market you can't see.`,
    };
  }

  if (direction === "firming") {
    if (yourRate >= strong) {
      return {
        ...withRungs,
        action: "raise",
        headline: "Push the ceiling",
        why: `The market's firming and you're already at your strong rung (${usd(strong)}). Raise the ceiling — quote higher and hold firm. This is when a hot market pays.`,
        recommendedRate: strong,
      };
    }
    const move = pctMove(yourRate, strong);
    return {
      ...withRungs,
      action: "raise",
      headline: `Raise ${signed(move)}`,
      why: `The market's firming — push toward your strong rung (${usd(strong)}). Sitting at ${usd(yourRate)} leaves room on the table.`,
      movePct: move,
      recommendedRate: strong,
    };
  }

  if (direction === "softening") {
    if (yourRate <= floor) {
      return {
        ...withRungs,
        action: "protect",
        headline: "At your floor — hold the line",
        why: `You're already at your floor (${usd(floor)}). Don't chase lower — break-even is ${usd(be)}. If it drops further, cut costs or sit it out.`,
        recommendedRate: floor,
      };
    }
    const roomToFloor = pctMove(yourRate, floor); // negative
    return {
      ...withRungs,
      action: "protect",
      headline: `Hold — ${absPct(roomToFloor)} cushion to floor`,
      why: `The market's softening. Hold as high as you can; you've got ${absPct(roomToFloor)} of cushion down to your floor (${usd(floor)}) before the edge — don't chase below it.`,
    };
  }

  // Flat market.
  if (yourRate < target) {
    const move = pctMove(yourRate, target);
    return {
      ...withRungs,
      action: "raise",
      headline: `Room to push ${signed(move)}`,
      why: `Steady market and you're under target (${usd(target)}). Room to push ${signed(move)} without fighting the cycle.`,
      movePct: move,
      recommendedRate: target,
    };
  }
  return {
    ...withRungs,
    action: "hold",
    headline: "Hold",
    why: `Steady market and you're at or above target (${usd(target)}). Hold your rate.`,
  };
};

export interface MarketPlaybook {
  direction: MarketDirection | null;
  pctChange: number | null; // the index's move over the trend window
  tiers: TierPlay[]; // [standard, specialized]
}

// The whole playbook: your recent median rate per tier (gross $/driven mile,
// same basis as the ladders) + the index direction → a play per tier. Standard =
// the "standard" bucket; Specialized folds in specialized + hazmat.
export const buildMarketPlaybook = (
  points: RatePoint[],
  stdLadder: RateLadder,
  specLadder: RateLadder,
  trend: { direction: MarketDirection; pctChange: number } | null,
  now: Date,
  windowDays = 90,
): MarketPlaybook => {
  const stdRate = median(
    windowRates(points.filter((p) => p.bucket === "standard"), now, windowDays),
  );
  const specRate = median(
    windowRates(points.filter((p) => p.bucket !== "standard"), now, windowDays),
  );
  const dir = trend?.direction ?? null;
  return {
    direction: dir,
    pctChange: trend?.pctChange ?? null,
    tiers: [
      buildTierPlay("standard", "Standard flatbed", stdLadder, stdRate, dir),
      buildTierPlay("specialized", "Specialized / oversize", specLadder, specRate, dir),
    ],
  };
};
