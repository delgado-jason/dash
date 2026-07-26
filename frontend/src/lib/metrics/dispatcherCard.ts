// Dispatcher-card math — the booking game, scoped to ONE person via booked_by.
// Everything a dispatcher is graded on is GROSS (the market value they book),
// never net; net is Jason's operational result, not theirs. Pure; `now` is
// passed in so it's testable.
import type { Load } from "@/types/load";
import { loadGross, type RateLadder } from "./rateTargets";
import { detentionCollectedMinutes } from "@/lib/detention";
import { agentStops, scoreStops } from "./stopScore";
import { rpmGrade, type Grade } from "./playerCard";

// Career ranks climb on lifetime loads booked — the dispatcher's analogue of the
// driver's lifetime miles.
export const RANK_TIERS = [
  { min: 0, name: "Rookie Dispatcher" },
  { min: 25, name: "Load Wrangler" },
  { min: 75, name: "Freight Closer" },
  { min: 200, name: "Rate Hawk" },
  { min: 500, name: "Dispatch Legend" },
];

export interface DispatchRank {
  name: string;
  index: number;
  count: number;
  next: { name: string; min: number } | null;
  toNext: number; // loads to the next tier
  pct: number; // progress within the current tier, 0..1
}

export const dispatchRank = (loadsBooked: number): DispatchRank => {
  let i = 0;
  for (let t = 0; t < RANK_TIERS.length; t++) {
    if (loadsBooked >= RANK_TIERS[t].min) i = t;
  }
  const cur = RANK_TIERS[i];
  const next = i < RANK_TIERS.length - 1 ? RANK_TIERS[i + 1] : null;
  const toNext = next ? Math.max(0, next.min - loadsBooked) : 0;
  const span = next ? next.min - cur.min : 1;
  const pct = next ? Math.min(1, (loadsBooked - cur.min) / span) : 1;
  return {
    name: cur.name,
    index: i,
    count: loadsBooked,
    next: next ? { name: next.name, min: next.min } : null,
    toNext,
    pct,
  };
};

export interface DispatcherCard {
  loadsBookedLifetime: number;
  loadsBookedMonth: number;
  grossBooked: number;
  avgBookedRate: number | null; // gross $/loaded-mile she books
  breakEven: number | null; // the ladder floor (per loaded mile)
  overBreakEven: number | null; // avgBookedRate − breakEven
  detentionCollectedMin: number; // detention hours she chased down and got paid
  onTimePct: number | null;
  rank: DispatchRank;
  seasonGrade: Grade | null;
}

// A "real" booking is any of her loads that didn't cancel — she still did the
// work of booking a load that later fell through isn't counted against her, but
// a cancelled load isn't freight, so it doesn't count for her either.
const isReal = (l: Load) => l.load_status !== "cancelled";

const grossPerMile = (loads: Load[]): number | null => {
  const withMiles = loads.filter((l) => Number(l.loaded_miles) > 0);
  const miles = withMiles.reduce((s, l) => s + Number(l.loaded_miles), 0);
  if (miles <= 0) return null;
  return withMiles.reduce((s, l) => s + loadGross(l), 0) / miles;
};

export const getDispatcherCard = (
  loads: Load[],
  userId: string,
  ladder: RateLadder,
  freeHours: number,
  now: Date,
): DispatcherCard => {
  const mine = loads.filter((l) => l.booked_by === userId && isReal(l));

  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const inThisMonth = (iso: string | null | undefined) =>
    !!iso &&
    new Date(iso).getUTCFullYear() === year &&
    new Date(iso).getUTCMonth() === month;

  const avgBookedRate = grossPerMile(mine);
  const breakEven = ladder.walkAway;
  const overBreakEven =
    avgBookedRate != null && breakEven != null
      ? avgBookedRate - breakEven
      : null;

  // Collected = confirmed billable AND paid (detentionCollectedMinutes gates on both).
  const detentionCollectedMin = mine.reduce(
    (s, l) => s + detentionCollectedMinutes(l, freeHours),
    0,
  );

  // On-time only over loads that actually ran.
  const delivered = mine.filter((l) => l.load_status === "delivered");
  const onTimePct = scoreStops(agentStops(delivered, freeHours)).onTimePct;

  // Season grade = recent (90-day) booking rate graded against the ladder.
  const cutoff = now.getTime() - 90 * 86_400_000;
  const recent = mine.filter(
    (l) => l.pickup_date && new Date(l.pickup_date).getTime() >= cutoff,
  );
  const seasonGrade = rpmGrade(grossPerMile(recent), ladder);

  return {
    loadsBookedLifetime: mine.length,
    loadsBookedMonth: mine.filter((l) => inThisMonth(l.pickup_date)).length,
    grossBooked: mine.reduce((s, l) => s + loadGross(l), 0),
    avgBookedRate,
    breakEven,
    overBreakEven,
    detentionCollectedMin,
    onTimePct,
    rank: dispatchRank(mine.length),
    seasonGrade,
  };
};
