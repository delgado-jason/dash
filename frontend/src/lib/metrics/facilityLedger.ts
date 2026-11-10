import type { Load } from "@/types/load";
import { dwellMinutes } from "@/lib/stopTimes";
import { median } from "./stats";

// The per-facility time story behind the ledger rows: median dwell across its
// timed stops, how many stops are timed, and the last visit date (pickup date
// for shipper stops, delivery date for receiver stops). Pure; every number
// travels with its sample size so a 1-stop "median" can't masquerade as a
// track record.

// A cancelled booking never happened at the dock: it is not a visit, so it
// feeds no dwell, no last-in and no count here. (The backend's per-facility
// as_shipper / as_receiver counts skip cancelled loads the same way.)
const happened = (l: Load): boolean => l.load_status !== "cancelled";

export interface FacilityTimes {
  medianDwellMin: number | null;
  timed: number;
  lastVisit: string | null;
}

export const facilityTimes = (loads: Load[], facilityId: string): FacilityTimes => {
  const dwells: number[] = [];
  let last: string | null = null;
  const touch = (d?: string | null) => {
    if (d && (last == null || d > last)) last = d;
  };
  for (const l of loads) {
    if (!happened(l)) continue;
    if (l.shipper_facility_id === facilityId) {
      // The appointment is passed so an EARLY arrival is not charged to the
      // facility (Jason's rule, 2026-11-10): the clock starts at the later of
      // the arrival and the appointment. Rolling in three hours before the dock
      // opens is his call, and this ledger is a verdict on them.
      const m = dwellMinutes(l.shipper_in, l.shipper_out, l.pickup_appt_start);
      if (m != null) dwells.push(m);
      touch(l.pickup_date);
    }
    if (l.receiver_facility_id === facilityId) {
      const m = dwellMinutes(l.receiver_in, l.receiver_out, l.delivery_appt_start);
      if (m != null) dwells.push(m);
      touch(l.delivery_date ?? l.pickup_date);
    }
  }
  return { medianDwellMin: median(dwells), timed: dwells.length, lastVisit: last };
};

// Fleet-wide count of timed stops (in + out both logged) at known facilities —
// the answering line's "how much clock have we actually captured".
export const timedStopCount = (loads: Load[]): number => {
  let n = 0;
  for (const l of loads) {
    if (!happened(l)) continue;
    if (l.shipper_facility_id && dwellMinutes(l.shipper_in, l.shipper_out) != null) n++;
    if (l.receiver_facility_id && dwellMinutes(l.receiver_in, l.receiver_out) != null) n++;
  }
  return n;
};

// A median dwell past this reads as "slow" on the ledger — half a workday
// gone to one dock. Presentation cue only; detention math lives in
// lib/detention and owes nothing to this number.
export const SLOW_DWELL_MIN = 360;
