// Brandie's board, in the order she needs it: NOW · NEXT · OWED.
//
// Her dashboard used to open with five KPI cells — two of them monthly
// aggregates she cannot act on today — and the one urgent fact, that nothing
// is booked behind the load that is rolling, sat in a fifth of a strip. She
// has ONE question that repeats on a horizon of hours: is the truck covered,
// and what do I do next? (Nod Sheet "Brandie's board", 2026-11-09.)
//
// Everything here is operational. No net revenue, no RPM, no P&L — that rule
// predates this file and stands.
import type { Load } from "@/types/load";
import { detentionEligible, detentionOwed } from "@/lib/detention";

// A load that is on the road right now.
export interface Rolling {
  load: Load;
  /** YYYY-MM-DD, the day it is due to deliver. Null when none is set. */
  deliversOn: string | null;
  /** "08:00" — the delivery appointment's start, when there is one. */
  deliversAt: string | null;
  /** Where the truck ends up, which is where the next load has to start. */
  freeCity: string | null;
  freeState: string | null;
  /** No in-time logged at the shipper: detention cannot be counted on it. */
  needsInTime: boolean;
}

// The gap between the last thing rolling and the next thing booked.
export interface Gap {
  booked: number;
  rolling: number;
  /** The day the truck comes free, from the LAST load due to deliver. */
  freeOn: string | null;
  freeAt: string | null;
  freeCity: string | null;
  freeState: string | null;
  /** Nothing rolling and nothing booked — the truck is already sitting. */
  sittingNow: boolean;
}

export type OwedKind = "detention" | "appointment" | "intime";
export interface Owed {
  kind: OwedKind;
  count: number;
  /** The load numbers behind the count, so the line can name them. */
  loads: string[];
}

export interface DispatchBoard {
  now: Rolling[];
  gap: Gap;
  owed: Owed[];
}

const day = (v: string | null | undefined): string | null => {
  const s = String(v ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

// "14:00:00" → "14:00". A time column comes back with seconds dash never shows.
const hhmm = (v: string | null | undefined): string | null => {
  const s = String(v ?? "").slice(0, 5);
  return /^\d{2}:\d{2}$/.test(s) ? s : null;
};

const rollingOf = (l: Load): Rolling => ({
  load: l,
  deliversOn: day(l.delivery_date),
  deliversAt: hhmm(l.delivery_appt_start),
  freeCity: l.destination_city ?? null,
  freeState: l.destination_state ?? null,
  // An in-time is how detention starts counting. Missing it on a load that is
  // already rolling is not a data-entry nicety — it is money that cannot be
  // claimed later, because the clock was never started.
  needsInTime: !l.shipper_in,
});

// The LAST of the dated loads, which is when the truck is actually free. A
// load with no delivery date cannot set the moment, so it never wins — but it
// does not block the ones that can.
const latest = (rows: Rolling[]): Rolling | null => {
  let best: Rolling | null = null;
  for (const r of rows) {
    if (r.deliversOn == null) continue;
    if (best == null || r.deliversOn > best.deliversOn!) best = r;
  }
  return best;
};

// Pickups this close with no appointment window are worth a call today.
export const APPOINTMENT_LEAD_DAYS = 3;

const addDays = (key: string, n: number): string => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const dispatchBoard = (
  loads: Load[],
  freeHours: number,
  today: string,
): DispatchBoard => {
  const now = loads.filter((l) => l.load_status === "in_transit").map(rollingOf);
  const booked = loads.filter((l) => l.load_status === "booked");

  // When the truck frees: the last rolling load's delivery, or — if nothing is
  // rolling — the last booked one's. With neither, it is sitting right now.
  const free = latest(now) ?? latest(booked.map(rollingOf));
  const gap: Gap = {
    booked: booked.length,
    rolling: now.length,
    freeOn: free?.deliversOn ?? null,
    freeAt: free?.deliversAt ?? null,
    freeCity: free?.freeCity ?? null,
    freeState: free?.freeState ?? null,
    sittingNow: now.length === 0 && booked.length === 0,
  };

  const owed: Owed[] = [];
  const push = (kind: OwedKind, rows: Load[]) => {
    if (rows.length > 0) owed.push({ kind, count: rows.length, loads: rows.map((l) => l.load_number) });
  };

  // Detention she can still act on: billable-and-unpaid, or eligible and not
  // yet decided. A paid one is finished and a declined one is a decision, not
  // a chase (the detention model is recommend → confirm → collect).
  push("detention", loads.filter((l) => detentionOwed(l) || detentionEligible(l, freeHours)));

  // A pickup inside the lead window with no appointment start.
  const soon = addDays(today, APPOINTMENT_LEAD_DAYS);
  push(
    "appointment",
    booked.filter((l) => {
      const p = day(l.pickup_date);
      return p != null && p <= soon && !l.pickup_appt_start;
    }),
  );

  // Rolling loads whose clock was never started. Same fact the NOW band flags
  // per load; counted here so the chase list is complete on its own.
  push("intime", now.filter((r) => r.needsInTime).map((r) => r.load));

  return { now, gap, owed };
};
