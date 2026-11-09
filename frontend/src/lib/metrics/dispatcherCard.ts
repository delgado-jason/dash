// Dispatcher-card math — the booking game, scoped to ONE person via booked_by.
// Everything a dispatcher is graded on is GROSS (the market value they book),
// never net; net is Jason's operational result, not theirs. Pure; `now` is
// passed in so it's testable.
import type { Load } from "@/types/load";
import { loadGross, type RateLadder } from "./rateTargets";
import { grossPerDrivenMile, gradeGrossPerDrivenMile } from "./drivenRate";
import { detentionCollectedMinutes } from "@/lib/detention";
import { agentStops, scoreStops } from "./stopScore";
import type { Grade } from "./playerCard";
import { isDelivered, isNeverRevenue } from "./status";

export interface DispatcherCard {
  loadsBookedLifetime: number;
  loadsBookedMonth: number;
  grossBooked: number;
  avgBookedRate: number | null; // gross $/DRIVEN mile she books (loads with unknown driven miles left out)
  drivenUnknown: number; // loads left out of that rate — no odometer window, no known deadhead
  breakEven: number | null; // the ladder floor (per driven mile)
  overBreakEven: number | null; // avgBookedRate − breakEven
  detentionCollectedMin: number; // detention hours she chased down and got paid
  onTimePct: number | null;
  onTimeCount: number; // graded stops that hit on-time — raw, never gated
  gradedStops: number; // stops with an appointment + arrival
  seasonGrade: Grade | null;
}

// A "real" booking is freight: a cancelled load isn't, and neither is a TONU
// (GL-104) — that one shows as its own line and counts only as cash.
const isReal = (l: Load) => !isNeverRevenue(l);

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

  const driven = grossPerDrivenMile(mine);
  const avgBookedRate = driven.rpm;
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
  const delivered = mine.filter((l) => isDelivered(l));
  const stopScore = scoreStops(agentStops(delivered, freeHours));
  const onTimePct = stopScore.onTimePct;

  // Season grade = recent (90-day) booking rate graded against the ladder.
  const cutoff = now.getTime() - 90 * 86_400_000;
  const recent = mine.filter(
    (l) => l.pickup_date && new Date(l.pickup_date).getTime() >= cutoff,
  );
  const seasonGrade = gradeGrossPerDrivenMile(recent, ladder);

  return {
    loadsBookedLifetime: mine.length,
    loadsBookedMonth: mine.filter((l) => inThisMonth(l.pickup_date)).length,
    grossBooked: mine.reduce((s, l) => s + loadGross(l), 0),
    avgBookedRate,
    drivenUnknown: driven.unknown,
    breakEven,
    overBreakEven,
    detentionCollectedMin,
    onTimePct,
    onTimeCount: stopScore.onTimeCount,
    gradedStops: stopScore.gradedStops,
    seasonGrade,
  };
};
