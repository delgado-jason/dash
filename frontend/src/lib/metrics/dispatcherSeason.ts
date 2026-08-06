// Per-dispatcher SEASON — a month/quarter/year recap of one person's booked
// loads, plus three earnable period trophies. Scoped by booked_by, all GROSS
// (see agents/lanes principle), reusing the recap RecapScope/range machinery.
// Pure; `now`/ranges are passed in so it's testable.
import type { Load } from "@/types/load";
import { loadGross, type RateLadder } from "./rateTargets";
import { agentStops, scoreStops } from "./stopScore";
import { rangeFor, resolvePeriod, type RecapScope, type RecapRange } from "./recap";
import type { Award } from "./awards";

const isReal = (l: Load) => l.load_status !== "cancelled";

const inRange = (iso: string | null | undefined, r: RecapRange): boolean => {
  if (!iso) return false;
  const t = new Date(iso.slice(0, 10) + "T00:00:00Z").getTime();
  return t >= r.start.getTime() && t < r.end.getTime();
};

// A dispatcher's loads inside a period — booked by them, not cancelled, and
// picked up in the range (credit follows when the load actually ran).
const loadsInPeriod = (loads: Load[], userId: string, r: RecapRange): Load[] =>
  loads.filter(
    (l) => l.booked_by === userId && isReal(l) && inRange(l.pickup_date, r),
  );

// Gross $/loaded-mile over a set (matches the dispatcher card's avgBookedRate).
const grossPerMile = (loads: Load[]): number | null => {
  const withMiles = loads.filter((l) => Number(l.loaded_miles) > 0);
  const miles = withMiles.reduce((s, l) => s + Number(l.loaded_miles), 0);
  return miles > 0 ? withMiles.reduce((s, l) => s + loadGross(l), 0) / miles : null;
};
const rpm = (l: Load): number => {
  const m = Number(l.loaded_miles) || 0;
  return m > 0 ? loadGross(l) / m : 0;
};

// "Booking Champion" bar scales with the period length.
export const BOOKING_BAR: Record<RecapScope, number> = {
  month: 8,
  quarter: 24,
  year: 90,
};

export type SeasonTrophyKey = "booking" | "rate" | "perfect";
export interface SeasonTrophy {
  key: SeasonTrophyKey;
  name: string;
  earned: boolean;
  detail: string; // earned blurb, or what's still missing
}

export interface DispatchSeason {
  scope: RecapScope;
  label: string;
  loadsBooked: number;
  grossBooked: number;
  avgRpm: number | null;
  onTimePct: number | null;
  bestLoad: number | null;
  topAgent: string | null;
  topLane: string | null;
  trophies: SeasonTrophy[];
  hasData: boolean;
}

// The period CONTAINING now (the current, in-progress month/quarter/year) — the
// season card's default. (recap's resolvePeriod only looks at finished periods.)
export const currentRange = (scope: RecapScope, now: Date): RecapRange => {
  const y = now.getUTCFullYear();
  if (scope === "year") return rangeFor("year", y, 0);
  if (scope === "quarter")
    return rangeFor("quarter", y, Math.floor(now.getUTCMonth() / 3));
  return rangeFor("month", y, now.getUTCMonth());
};

const topBy = (loads: Load[], keyOf: (l: Load) => string): string | null => {
  const m = new Map<string, number>();
  for (const l of loads) {
    const k = keyOf(l);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  let best: string | null = null;
  let n = 0;
  for (const [k, c] of m) if (c > n) ((n = c), (best = k));
  return best;
};

const trophiesFor = (
  scope: RecapScope,
  mine: Load[],
  avgRpm: number | null,
  ladder: RateLadder,
): SeasonTrophy[] => {
  const target = ladder.target;
  const withMiles = mine.filter((l) => Number(l.loaded_miles) > 0);
  const underTarget =
    target != null ? withMiles.filter((l) => rpm(l) < target).length : 0;
  const bar = BOOKING_BAR[scope];

  return [
    {
      key: "booking",
      name: "Booking Champion",
      earned: mine.length >= bar,
      detail:
        mine.length >= bar
          ? `${mine.length} loads booked`
          : `${mine.length} / ${bar} loads`,
    },
    {
      key: "rate",
      name: "Rate Champion",
      earned: avgRpm != null && target != null && avgRpm >= target,
      detail:
        avgRpm == null || target == null
          ? "no rate yet"
          : avgRpm >= target
            ? `$${avgRpm.toFixed(2)} avg rate`
            : `$${avgRpm.toFixed(2)} vs $${target.toFixed(2)} target`,
    },
    {
      key: "perfect",
      name: "Perfect Period",
      earned: target != null && withMiles.length > 0 && underTarget === 0,
      detail:
        target == null
          ? "no target set"
          : withMiles.length === 0
            ? "no loads yet"
            : underTarget === 0
              ? "every load at target"
              : `${underTarget} load${underTarget === 1 ? "" : "s"} under target`,
    },
  ];
};

export const dispatchSeason = (
  loads: Load[],
  userId: string,
  scope: RecapScope,
  range: RecapRange,
  ladder: RateLadder,
  freeHours: number,
): DispatchSeason => {
  const mine = loadsInPeriod(loads, userId, range);
  const avgRpm = grossPerMile(mine);
  const delivered = mine.filter((l) => l.load_status === "delivered");
  const onTimePct = delivered.length
    ? scoreStops(agentStops(delivered, freeHours)).onTimePct
    : null;
  return {
    scope,
    label: range.label,
    loadsBooked: mine.length,
    grossBooked: mine.reduce((s, l) => s + loadGross(l), 0),
    avgRpm,
    onTimePct,
    bestLoad: mine.length ? Math.max(...mine.map(loadGross)) : null,
    topAgent: topBy(mine, (l) => l.agent),
    topLane: topBy(mine, (l) =>
      l.origin_market && l.delivery_market
        ? `${l.origin_market} → ${l.delivery_market}`
        : "",
    ),
    trophies: trophiesFor(scope, mine, avgRpm, ladder),
    hasData: mine.length > 0,
  };
};

// The current in-progress period (what the card shows by default per scope).
export const currentSeason = (
  loads: Load[],
  userId: string,
  scope: RecapScope,
  ladder: RateLadder,
  freeHours: number,
  now: Date,
): DispatchSeason =>
  dispatchSeason(loads, userId, scope, currentRange(scope, now), ladder, freeHours);

// Recent COMPLETED periods for the history strip: label + trophies won + loads.
export interface SeasonLogEntry {
  label: string;
  trophies: number;
  loads: number;
}
export const dispatchSeasonLog = (
  loads: Load[],
  userId: string,
  scope: RecapScope,
  ladder: RateLadder,
  freeHours: number,
  now: Date,
  count = 4,
): SeasonLogEntry[] => {
  const out: SeasonLogEntry[] = [];
  for (let ago = count - 1; ago >= 0; ago--) {
    const r = resolvePeriod(scope, ago, now);
    const s = dispatchSeason(loads, userId, scope, r, ladder, freeHours);
    out.push({
      label: r.label,
      trophies: s.trophies.filter((t) => t.earned).length,
      loads: s.loadsBooked,
    });
  }
  return out;
};

// Award pops for newly-earned CURRENT-period trophies (month/quarter/year). Each
// fires once per period via its label-keyed id; tier "record" = a corner
// slide-in, not the owner's full-screen takeover.
export const dispatcherSeasonAwards = (
  loads: Load[],
  userId: string,
  ladder: RateLadder,
  freeHours: number,
  now: Date,
): Award[] => {
  const out: Award[] = [];
  const ICON: Record<SeasonTrophyKey, string> = {
    booking: "trophy",
    rate: "trophy",
    perfect: "medal",
  };
  for (const scope of ["month", "quarter", "year"] as RecapScope[]) {
    const s = currentSeason(loads, userId, scope, ladder, freeHours, now);
    for (const t of s.trophies)
      if (t.earned)
        out.push({
          id: `trophy:disp-${t.key}:${scope}:${s.label}`,
          tier: "record",
          name: `${t.name} · ${s.label}`,
          detail: t.detail,
          icon: ICON[t.key],
        });
  }
  return out;
};
