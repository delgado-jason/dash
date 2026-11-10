// The live clock on a stop: how long the truck has been sitting, and how much
// of that is claimable.
//
// Two numbers off ONE anchor (`stopAnchorMin`'s rule, on moments): the later of
// the arrival and the appointment's START.
//
//   DWELL      how long the stop has held the truck. Always runs.
//   DETENTION  the claimable part of that — past the free hours, and only when
//              a claim is possible at all.
//
// Claimability is Jason's rule (2026-11-10): "a late arrival or missing an
// appointment time means I will not be able to claim detention." So a stop can
// sit for nine hours and be worth nothing — arriving late forfeits it, and a
// stop nobody scheduled was never on a clock. Early still claims: you were
// there, waiting, from the moment you were due.
//
// A truck due at 14:00 that rolls in at 12:00 with 3 free hours has held
// nothing at 12:00 — its clock starts at 14:00, reads 3h at 17:00, and turns
// claimable at 17:01. The two early hours belong to the driver, not the dock,
// which is why dwell cannot simply count from the arrival.
//
// WHY THIS FILE EXISTS, when `detentionMinutes(load, freeHours)` already
// computes the stored figure: that one works in minutes-of-day on `time`
// columns, so it needs a release to measure against and cannot cross midnight.
// This one works on the `*_at` stamps (migration 106), which carry their dates,
// so it can count a stop that is still running and one that began yesterday.
// It does not change any stored or settled number.
import type { Load } from "@/types/load";
import type { NoClaim } from "@/lib/detention";

export interface StopClock {
  /** The stop was reached — we have something to count from. */
  started: boolean;
  /** Backed by a real timestamp rather than a bare time of day. */
  exact: boolean;
  /** Still sitting: reached and not yet released. */
  running: boolean;
  /** Minutes held, from the anchor below — live when running, final when released. */
  dwellMinutes: number | null;
  /** When the clock started: the later of the arrival and the appointment's start. */
  anchorAt: Date | null;
  /** The moment free time runs out. Null when no claim is possible. */
  freeUntil: Date | null;
  /** Claimable minutes past the free window. Never negative. */
  detentionMinutes: number;
  /** Why nothing can be claimed here, when that is the case. */
  noClaim: NoClaim | null;
}

const EMPTY: StopClock = {
  started: false, exact: false, running: false, dwellMinutes: null,
  anchorAt: null, freeUntil: null, detentionMinutes: 0, noClaim: null,
};

const stamp = (v: string | null | undefined): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

// A bare "HH:MM[:SS]" on a "YYYY-MM-DD", as a LOCAL moment.
//
// An appointment is a wall-clock time at a dock — "back in at 08:00" — so it
// has to be read in wall-clock terms, and the browser's zone is the only one
// dash has ever had. Building it with the local Date constructor is the whole
// point: `new Date("2026-11-10T08:00:00Z")` would be 02:00 in Texas and every
// comparison against it would be six hours wrong.
//
// Dating it by its own SCHEDULED day — not by the day the stamp landed on — is
// what closes the overnight case. A truck that backs in at 23:00 on the 10th
// for an 06:00 appointment on the 11th is seven hours EARLY. Anchored to the
// arrival's day it would read seventeen hours late and forfeit a real claim.
const wallMoment = (
  onDate: string | null | undefined,
  time: string | null | undefined,
): Date | null => {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(onDate ?? ""));
  const t = /^(\d{2}):(\d{2})/.exec(String(time ?? ""));
  if (!d || !t) return null;
  return new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
};

/**
 * One stop's clock.
 *
 * `inAt`/`outAt` are the timestamps a console tap writes (migration 106).
 * `onDate` is the day the appointment is SCHEDULED for — the load's pickup day
 * at the shipper, its delivery day at the receiver.
 */
export const stopClock = (
  inAt: string | null | undefined,
  outAt: string | null | undefined,
  apptStart: string | null | undefined,
  apptEnd: string | null | undefined,
  onDate: string | null | undefined,
  freeHours: number,
  now: Date,
): StopClock => {
  const reached = stamp(inAt);
  const released = stamp(outAt);
  // No arrival stamp means no clock. A bare time of day cannot be counted from
  // without inventing the day it belonged to, and a timer that invents a day
  // is worse than one that says it cannot run.
  if (!reached) return EMPTY;

  const until = released ?? now;

  // Two moments out of one appointment, and they do different jobs:
  //   startAt — the appointment's START. Anchors both clocks.
  //   lateAt  — the window's END, else the hard appointment. Decides lateness.
  // Missing a window is being late; arriving inside one is not.
  const startAt = wallMoment(onDate, apptStart);
  const lateAt = wallMoment(onDate, apptEnd) ?? startAt;

  // THE ANCHOR — `stopAnchorMin`'s rule on absolute moments: the later of the
  // arrival and the appointment's start. Early time is his own, so it is
  // charged to nobody.
  const anchorAt =
    startAt != null && startAt.getTime() > reached.getTime() ? startAt : reached;

  // Clamped at 0: a facility can release a truck before its appointment even
  // comes round (load 6913105 did), and that is zero minutes held, not a
  // negative.
  const dwellMinutes = Math.max(0, Math.round((until.getTime() - anchorAt.getTime()) / 60000));

  // The gate — the SAME RULE as `detentionBar`, applied to moments instead of
  // minutes-of-day. It is written out here rather than delegated because the
  // two paths compare different things: that one has a bare "09:44" and must
  // assume a day, this one has an absolute stamp and an appointment anchored to
  // its scheduled date, which is the whole reason it can be trusted overnight.
  // They share the type and the words so a new reason appears in both at once.
  // If you change the rule, change it in both files — the tests on each side
  // name the other.
  //
  // "no-arrival" cannot occur: a stop with no arrival stamp returned EMPTY above.
  const noClaim: NoClaim | null =
    !apptStart || lateAt == null
      ? "no-appointment" // never set, or set with no date to hang it on
      : reached.getTime() > lateAt.getTime()
        ? "late"
        : null;

  const freeUntil =
    noClaim != null ? null : new Date(anchorAt.getTime() + freeHours * 3600000);
  const detentionMinutes =
    freeUntil == null ? 0 : Math.max(0, Math.round((until.getTime() - freeUntil.getTime()) / 60000));

  return {
    started: true, exact: true, running: released == null,
    dwellMinutes, anchorAt, freeUntil, detentionMinutes, noClaim,
  };
};

/** Both stops of a load, for the console card. */
export const loadStops = (load: Load, freeHours: number, now: Date) => ({
  shipper: stopClock(
    load.shipper_in_at, load.shipper_out_at,
    load.pickup_appt_start, load.pickup_appt_end,
    load.pickup_date, freeHours, now,
  ),
  receiver: stopClock(
    load.receiver_in_at, load.receiver_out_at,
    load.delivery_appt_start, load.delivery_appt_end,
    load.delivery_date, freeHours, now,
  ),
});

/**
 * Did this stop happen — counting BOTH ways it can be recorded?
 *
 * A stop is completed either by a tap on the console (a stamp, which carries
 * its date) or by a time typed on the load page (a bare time, which does not).
 * Both are legitimate. Which one it was decides what can be DISPLAYED — a live
 * clock needs the date — but never whether the truck was there.
 *
 * v1.272.0 shipped without this distinction: the card asked `clock.started`,
 * which is only ever true for a stamp. A load whose shipper times were typed
 * showed no buttons at all, and its receiver stayed locked behind a shipper
 * the card could not see had been left. Jason hit it the first day.
 */
export interface StopProgress {
  /** The truck got there. */
  reached: boolean;
  /** And was let go. */
  released: boolean;
}

export const stopProgress = (
  clock: StopClock,
  legacyIn: string | null | undefined,
  legacyOut: string | null | undefined,
): StopProgress => ({
  reached: clock.started || !!legacyIn,
  released: (clock.started && !clock.running) || !!legacyOut,
});

/** "1h 48m" · "47m" · "0m". A clock reads in hours and minutes, never decimals. */
export const hm = (minutes: number): string => {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
};

/** "14:02" — a stamp as the wall-clock time it was taken at. */
export const atClock = (v: string | null | undefined): string | null => {
  const d = stamp(v);
  return d == null ? null : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
