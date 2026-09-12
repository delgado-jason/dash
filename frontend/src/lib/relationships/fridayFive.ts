// The Friday five (ADMIN-02 v1.1 §6) — the numbers Dispatch reports to the
// Owner every Friday, over the SOP's reporting week, Saturday → Friday in
// local time:
//   agents contacted        distinct agents reached on an outbound call
//                           (fallback: an outbound touch with no outcome on
//                           file counts too, and the number says so)
//   footprints              touches this week with footprint_captured
//   inbound load offers     inbound contacts of type inbound_inquiry — the
//                           leading indicator; everything else follows it
//   above break-even        loads booked (created) this week whose all-in RPM
//                           clears the ladder's walk-away, "n of m"
//   days empty              calendar days so far this week with no load in
//                           transit and no pickup
// plus the record hygiene the Friday afternoon completes. Pure; clock injected.
import type { Load } from "@/types/load";
import { loadGross } from "@/lib/metrics/rateTargets";
import { keyOf, localDayKey } from "./dayKeys";
import type { FootprintCoverageLike, FootprintLoadLike } from "./capacityList";

export interface FiveContactLike {
  agent_id: string;
  contacted_at: string; // ISO
  direction: "outbound" | "inbound";
  method: string;
  type: string;
  outcome?: string | null;
  footprint_captured?: boolean;
}

export interface FiveWeek {
  startKey: string; // the Saturday, local
  endKey: string; // the Friday, local
  throughKey: string; // today or the Friday, whichever is earlier — days-empty counts to here
}

const shiftLocal = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

// The reporting week containing `now`: the most recent Saturday on or before
// today, through the Friday after it.
export const fiveWeek = (now: Date): FiveWeek => {
  const back = (now.getDay() + 1) % 7; // Sat = 0 … Fri = 6
  const sat = shiftLocal(now, -back);
  const fri = shiftLocal(sat, 6);
  const today = localDayKey(now);
  const endKey = localDayKey(fri);
  return { startKey: localDayKey(sat), endKey, throughKey: today < endKey ? today : endKey };
};

const inWeek = (localKey: string, w: FiveWeek) => localKey >= w.startKey && localKey <= w.endKey;
const contactDay = (iso: string) => localDayKey(new Date(iso));

export interface AboveBreakEven {
  n: number;
  m: number; // loads booked this week
}

export interface FridayFive {
  week: FiveWeek;
  contacted: number;
  contactedUntimed: boolean; // some of the count came from outbound touches with no outcome on file
  footprints: number;
  inboundOffers: number;
  // null when nothing was booked this week or the ladder has no walk-away —
  // the UI prints "—", never "0 of 0".
  aboveBreakEven: AboveBreakEven | null;
  daysEmpty: number;
}

// A load's all-in RPM — gross over every mile, loaded and deadhead (deadhead
// missing → loaded only). null with no miles.
export const loadAllInRpm = (l: Load): number | null => {
  const miles = (Number(l.loaded_miles) || 0) + (l.deadhead_miles == null ? 0 : Number(l.deadhead_miles) || 0);
  return miles > 0 ? loadGross(l) / miles : null;
};

const shiftKey = (k: string, days: number): string => {
  const [y, m, d] = k.split("-").map(Number);
  return localDayKey(new Date(y, m - 1, d + days));
};

// Calendar days in [startKey, throughKey] with no non-cancelled load covering
// them — a load covers its pickup day through its delivery day (an in-transit
// load with no delivery date yet covers through today).
export const daysEmpty = (loads: Load[], week: FiveWeek): number => {
  const spans: { from: string; to: string }[] = [];
  for (const l of loads) {
    if (l.load_status === "cancelled" || !l.pickup_date) continue;
    const from = keyOf(l.pickup_date);
    const to = l.delivery_date ? keyOf(l.delivery_date) : l.load_status === "in_transit" ? week.throughKey : from;
    spans.push({ from, to: to < from ? from : to });
  }
  let empty = 0;
  for (let k = week.startKey; k <= week.throughKey; k = shiftKey(k, 1)) {
    if (!spans.some((s) => s.from <= k && k <= s.to)) empty++;
  }
  return empty;
};

export const fridayFive = (contacts: FiveContactLike[], loads: Load[], walkAway: number | null, now: Date): FridayFive => {
  const week = fiveWeek(now);
  const reached = new Set<string>();
  const untimed = new Set<string>();
  let footprints = 0;
  let inboundOffers = 0;
  for (const c of contacts) {
    if (!inWeek(contactDay(c.contacted_at), week)) continue;
    if (c.footprint_captured) footprints++;
    if (c.direction === "inbound") {
      if (c.type === "inbound_inquiry") inboundOffers++;
      continue;
    }
    if (c.method === "call" && c.outcome === "reached") reached.add(c.agent_id);
    else if (c.outcome == null) untimed.add(c.agent_id);
  }
  const contactedIds = new Set([...reached, ...untimed]);
  const contactedUntimed = [...untimed].some((id) => !reached.has(id));

  const booked = loads.filter((l) => l.load_status !== "cancelled" && l.created_at && inWeek(contactDay(l.created_at), week));
  let aboveBreakEven: AboveBreakEven | null = null;
  if (booked.length > 0 && walkAway != null) {
    const n = booked.filter((l) => {
      const rpm = loadAllInRpm(l);
      return rpm != null && rpm >= walkAway;
    }).length;
    aboveBreakEven = { n, m: booked.length };
  }

  return {
    week,
    contacted: contactedIds.size,
    contactedUntimed,
    footprints,
    inboundOffers,
    aboveBreakEven,
    daysEmpty: daysEmpty(loads, week),
  };
};

const dayWord = (k: string): string =>
  new Date(`${k}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

// The plain text Dispatch pastes to the Owner.
export const fiveText = (f: FridayFive): string =>
  [
    `The five · ${dayWord(f.week.startKey)} – ${dayWord(f.week.endKey)}`,
    `Agents contacted: ${f.contacted}${f.contactedUntimed ? " (some untimed)" : ""}`,
    `Footprints completed: ${f.footprints}`,
    `Inbound load offers: ${f.inboundOffers}`,
    `Booked above break-even: ${f.aboveBreakEven ? `${f.aboveBreakEven.n} of ${f.aboveBreakEven.m}` : "—"}`,
    `Days empty: ${f.daysEmpty}`,
  ].join("\n");

// ---- record hygiene ----
export type HygieneKey = "phone" | "preferred" | "footprint";

export interface HygieneAgentLike {
  agent_id: string;
  phone?: string | null;
  preferred_contact: string | null;
}

export interface HygieneItem<A> {
  key: HygieneKey;
  label: string;
  agents: A[];
}

// Active agents (the caller passes the active book) missing a phone, a
// preferred channel, or any footprint at all — a delivered-load origin or a
// stated market.
export const hygiene = <A extends HygieneAgentLike>(
  activeAgents: A[],
  loads: FootprintLoadLike[],
  coverage: FootprintCoverageLike[],
): HygieneItem<A>[] => {
  const withOrigin = new Set<string>();
  for (const l of loads) if (l.agent_id && l.load_status === "delivered" && (l.origin_city ?? "").trim()) withOrigin.add(l.agent_id);
  const withStated = new Set(coverage.map((c) => c.agent_id));
  const items: HygieneItem<A>[] = [
    { key: "phone", label: "missing a phone", agents: activeAgents.filter((a) => !(a.phone ?? "").trim()) },
    { key: "preferred", label: "no preferred contact", agents: activeAgents.filter((a) => !a.preferred_contact) },
    { key: "footprint", label: "no footprint", agents: activeAgents.filter((a) => !withOrigin.has(a.agent_id) && !withStated.has(a.agent_id)) },
  ];
  return items.filter((i) => i.agents.length > 0);
};
