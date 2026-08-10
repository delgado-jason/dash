// Dwell / on-time / detention scoring over a set of stops — the Phase C
// scorecards for a facility (its own stops) and an agent (both stops of their
// freight). Medians throughout (per #235), and everything null/gated until
// there's enough logged data to mean something.
import type { Load } from "@/types/load";
import { dwellMinutes } from "@/lib/stopTimes";
import {
  onTimeStatus,
  stopDetentionMinutes,
  detentionMinutes,
  detentionCollected,
  type OnTime,
} from "@/lib/detention";
import { median } from "./stats";

// Below this many timed stops, we don't compute — we say "not enough data".
export const MIN_STOPS = 3;

interface Stop {
  dwellMin: number | null;
  onTime: OnTime | null;
  detentionMin: number;
  detentionUnpaid: boolean;
}

export interface StopScore {
  timedStops: number; // stops with in+out logged — the sample size
  medianDwellMin: number | null; // null until MIN_STOPS
  onTimePct: number | null; // 0..1 of graded stops that hit on-time
  onTimeCount: number; // graded stops that hit on-time — raw, never gated
  gradedStops: number; // stops with an appointment + arrival
  detentionCount: number; // timed stops that ran past free time
  unpaidCount: number; // of those, still not marked paid
  totalDwellMin: number; // summed dwell across timed stops
  hasData: boolean; // timedStops >= MIN_STOPS
}

const stopOf = (
  inT: string | null | undefined,
  outT: string | null | undefined,
  apptS: string | null | undefined,
  apptE: string | null | undefined,
  paid: boolean,
  freeHours: number,
): Stop => {
  const detentionMin = stopDetentionMinutes(inT, outT, apptS, apptE, freeHours);
  return {
    dwellMin: dwellMinutes(inT, outT),
    onTime: onTimeStatus(apptS, apptE, inT),
    detentionMin,
    detentionUnpaid: detentionMin > 0 && !paid,
  };
};

// Every stop this facility played across the loads, as shipper and/or receiver.
export const facilityStops = (
  loads: Load[],
  facilityId: string,
  freeHours: number,
): Stop[] => {
  const out: Stop[] = [];
  for (const l of loads) {
    if (l.shipper_facility_id === facilityId)
      out.push(
        stopOf(
          l.shipper_in,
          l.shipper_out,
          l.pickup_appt_start,
          l.pickup_appt_end,
          !!l.detention_paid,
          freeHours,
        ),
      );
    if (l.receiver_facility_id === facilityId)
      out.push(
        stopOf(
          l.receiver_in,
          l.receiver_out,
          l.delivery_appt_start,
          l.delivery_appt_end,
          !!l.detention_paid,
          freeHours,
        ),
      );
  }
  return out;
};

// Both stops of every load (used for an agent, whose loads are pre-filtered).
export const agentStops = (loads: Load[], freeHours: number): Stop[] => {
  const out: Stop[] = [];
  for (const l of loads) {
    out.push(
      stopOf(
        l.shipper_in,
        l.shipper_out,
        l.pickup_appt_start,
        l.pickup_appt_end,
        !!l.detention_paid,
        freeHours,
      ),
    );
    out.push(
      stopOf(
        l.receiver_in,
        l.receiver_out,
        l.delivery_appt_start,
        l.delivery_appt_end,
        !!l.detention_paid,
        freeHours,
      ),
    );
  }
  return out;
};

// Load-level detention record for an agent: how many of their loads ran past
// free time (technically claimable) vs how many actually got collected. A wide
// gap = an agent whose shippers hold you up and don't pay — worth flagging.
export interface AgentDetention {
  claimable: number; // loads with any detention-eligible time (past appt + free)
  paid: number; // of those, confirmed billable AND collected
}

export const agentDetention = (
  loads: Load[],
  freeHours: number,
): AgentDetention => {
  const claimable = loads.filter((l) => detentionMinutes(l, freeHours) > 0);
  return {
    claimable: claimable.length,
    paid: claimable.filter((l) => detentionCollected(l)).length,
  };
};

export const scoreStops = (stops: Stop[]): StopScore => {
  const timed = stops.filter((s) => s.dwellMin != null);
  const dwells = timed.map((s) => s.dwellMin as number);
  const graded = stops.filter((s) => s.onTime != null);
  // "waited" = you arrived BEFORE the window opened — early. You still made the
  // appointment, so it counts as on-time; only genuine "late" counts against.
  const onTimeN = graded.filter(
    (s) => s.onTime === "on-time" || s.onTime === "waited",
  ).length;
  const detStops = timed.filter((s) => s.detentionMin > 0);
  const enough = timed.length >= MIN_STOPS;

  return {
    timedStops: timed.length,
    medianDwellMin: enough ? median(dwells) : null,
    onTimePct: graded.length >= MIN_STOPS ? onTimeN / graded.length : null,
    onTimeCount: onTimeN,
    gradedStops: graded.length,
    detentionCount: detStops.length,
    unpaidCount: detStops.filter((s) => s.detentionUnpaid).length,
    totalDwellMin: dwells.reduce((a, b) => a + b, 0),
    hasData: enough,
  };
};
