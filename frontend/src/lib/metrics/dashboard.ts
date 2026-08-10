import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import { loadRevenue, loadGross } from "./rateTargets";
import { detentionOwed, detentionMinutes } from "@/lib/detention";
import { deadheadPctOver, hasOdometerWindow } from "./deadhead";
import { median } from "./stats";

// Revenue = the owner-op's NET take (their company gross), via loadRevenue —
// so every dashboard tile reflects money kept, not the full pre-cut rate.
const getLoadRevenue = (loads: Load[] | null): number | null => {
  if (!loads) return null;
  return loads.reduce((total, load) => total + loadRevenue(load), 0);
};

// ---- GET REVENUE MTD ----
export const getRevenueMTD = (loads: Load[]): number | null => {
  const currentDate = Date.now();
  const currentYear = new Date(currentDate).getUTCFullYear();
  const currentMonth = new Date(currentDate).getUTCMonth();

  // Filter loads
  const filteredLoads = loads.filter(
    (load) =>
      load.load_status === "delivered" &&
      load.delivery_date &&
      new Date(load.delivery_date).getUTCFullYear() === currentYear &&
      new Date(load.delivery_date).getUTCMonth() === currentMonth,
  );

  const grossRev = getLoadRevenue(filteredLoads);

  return grossRev;
};

// ---- GET LAST MONTHS REVENUE ----
export const getRevenueLastMonth = (loads: Load[]): number | null => {
  const now = new Date(Date.now());
  // First of last month in UTC. Deriving the (year, month) pair this way handles
  // the January → December rollover — `now.getUTCMonth() - 1` alone is -1 every
  // January, which no month matches, so last-month revenue read empty and the
  // month-over-month delta broke for the whole of January.
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevYear = prev.getUTCFullYear();
  const prevMonth = prev.getUTCMonth();

  const filteredLoads = loads.filter(
    (load) =>
      load.delivery_date &&
      load.load_status === "delivered" &&
      new Date(load.delivery_date).getUTCFullYear() === prevYear &&
      new Date(load.delivery_date).getUTCMonth() === prevMonth,
  );

  const grossRev = getLoadRevenue(filteredLoads);

  return grossRev;
};

// ---- GET REVENUE YTD ----
export const getRevenueYTD = (loads: Load[]): number | null => {
  const now = new Date();

  const filteredLoads = loads.filter(
    (load) =>
      load.delivery_date &&
      load.load_status === "delivered" &&
      new Date(load.delivery_date).getUTCFullYear() === now.getUTCFullYear(),
  );

  const grossRev = getLoadRevenue(filteredLoads);

  return grossRev;
};

// ---- MONTHLY DEADHEAD ---- (this month vs last month, trips included)

export interface MonthlyDeadhead {
  thisMonth: number | null;
  lastMonth: number | null;
}

// A load counts toward deadhead once it has both odometer readings AND a
// delivery date to place it in time; a trip needs its readings and a date.
// The window itself is no longer status-gated (metrics/deadhead.ts — miles are
// physics), so the KPI's product exclusions live here explicitly: cancelled
// and TONU loads stay out of the trend, as they always have.
const deadheadLoad = (load: Load): boolean =>
  hasOdometerWindow(load) &&
  !!load.delivery_date &&
  load.load_status !== "cancelled" &&
  load.load_status !== "tonu";
const deadheadTrip = (trip: Trip): boolean =>
  trip.odometer_start != null && trip.odometer_end != null && !!trip.trip_date;

// Deadhead % for a single UTC month.
const deadheadForMonth = (
  loads: Load[],
  trips: Trip[],
  year: number,
  month: number,
): number | null =>
  deadheadPctOver(
    loads.filter(
      (l) =>
        deadheadLoad(l) &&
        new Date(l.delivery_date as string).getUTCFullYear() === year &&
        new Date(l.delivery_date as string).getUTCMonth() === month,
    ),
    trips.filter(
      (t) =>
        deadheadTrip(t) &&
        new Date(t.trip_date as string).getUTCFullYear() === year &&
        new Date(t.trip_date as string).getUTCMonth() === month,
    ),
  );

// Deadhead % over a [startMs, endMs) window (UTC ms), by delivery/trip date.
const deadheadForWindow = (
  loads: Load[],
  trips: Trip[],
  startMs: number,
  endMs: number,
): number | null => {
  const inWin = (iso: string): boolean => {
    const t = new Date(iso).getTime();
    return t >= startMs && t < endMs;
  };
  return deadheadPctOver(
    loads.filter((l) => deadheadLoad(l) && inWin(l.delivery_date as string)),
    trips.filter((t) => deadheadTrip(t) && inWin(t.trip_date as string)),
  );
};

// This month's deadhead % and last month's, for the KPI comparison.
export const getMonthlyDeadhead = (
  loads: Load[],
  trips: Trip[],
): MonthlyDeadhead => {
  const now = new Date(Date.now());
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  // First-of-previous-month in UTC — handles the Jan → Dec year rollover.
  const prev = new Date(Date.UTC(year, month - 1, 1));

  return {
    thisMonth: deadheadForMonth(loads, trips, year, month),
    lastMonth: deadheadForMonth(
      loads,
      trips,
      prev.getUTCFullYear(),
      prev.getUTCMonth(),
    ),
  };
};

// Dispatch view: this calendar month's deadhead % vs the trailing 90-day
// average (the baseline). Lower is leaner. Either side is null when its window
// has no qualifying miles yet.
export interface DeadheadTrend {
  thisMonth: number | null;
  rolling90: number | null;
}

export const getDeadheadTrend = (
  loads: Load[],
  trips: Trip[],
  now: Date = new Date(Date.now()),
): DeadheadTrend => {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const monthStart = Date.UTC(year, month, 1);
  const nextMonth = Date.UTC(year, month + 1, 1);
  const end = now.getTime();
  const start = end - 90 * 24 * 60 * 60 * 1000;

  return {
    thisMonth: deadheadForWindow(loads, trips, monthStart, nextMonth),
    rolling90: deadheadForWindow(loads, trips, start, end),
  };
};

// Dispatch view: open detention to chase — loads that ran past free time and
// aren't marked collected. Hours (not dollars) since the rate isn't known until
// the settlement lands. Sorted longest-dwell first.
export interface DetentionItem {
  load_id: string;
  load_number: string;
  lane: string;
  minutes: number;
}
export interface DetentionOwed {
  loadCount: number;
  totalMinutes: number;
  items: DetentionItem[];
}

export const getDetentionOwed = (
  loads: Load[],
  freeHours: number,
): DetentionOwed => {
  const items = loads
    .filter((l) => detentionOwed(l))
    .map((l) => ({
      load_id: l.load_id,
      load_number: l.load_number,
      lane: `${l.origin_market} → ${l.delivery_market}`,
      minutes: detentionMinutes(l, freeHours),
    }))
    .sort((a, b) => b.minutes - a.minutes);

  return {
    loadCount: items.length,
    totalMinutes: items.reduce((sum, i) => sum + i.minutes, 0),
    items,
  };
};

// ---- MONTH KEY HELPER ---- (UTC, "YYYY-MM")
const getMonthKey = (isoDate: string): string => {
  const d = new Date(isoDate);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

// ---- BUILD CONTINUOUS MONTH RANGE ---- (ending at current month, going back N months)
const buildMonthRange = (monthsBack: number): string[] => {
  const now = new Date();
  const keys: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    // step back i months from the current UTC month
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
    );
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    keys.push(`${year}-${month}`);
  }
  return keys;
};

// ---- GET MONTHLY REVENUE ---- (continuous: every month in range, zeros filled)
export const getMonthlyRevenue = (
  loads: Load[],
  monthsBack: number = 12,
): { month: string; revenue: number }[] => {
  const delivered = loads.filter(
    (load) => load.load_status === "delivered" && load.delivery_date,
  );

  // Bucket delivered loads by month key
  const buckets: Record<string, Load[]> = {};
  for (const load of delivered) {
    const key = getMonthKey(load.delivery_date as string);
    (buckets[key] ??= []).push(load);
  }

  // Walk the continuous range; months with no loads → 0
  return buildMonthRange(monthsBack).map((month) => ({
    month,
    revenue: buckets[month] ? (getLoadRevenue(buckets[month]) ?? 0) : 0,
  }));
};

// ---- GET MONTHLY RPM ---- (continuous: blended per month, no-data months → null)
export const getMonthlyRPM = (
  loads: Load[],
  monthsBack: number = 12,
): { month: string; rpm: number | null }[] => {
  const delivered = loads.filter(
    (load) => load.load_status === "delivered" && load.delivery_date,
  );

  const buckets: Record<string, Load[]> = {};
  for (const load of delivered) {
    const key = getMonthKey(load.delivery_date as string);
    (buckets[key] ??= []).push(load);
  }

  return buildMonthRange(monthsBack).map((month) => {
    const monthLoads = buckets[month];
    if (!monthLoads) return { month, rpm: null }; // no data → null (gap in line)

    const revenue = getLoadRevenue(monthLoads) ?? 0;
    const miles = monthLoads.reduce(
      (sum, load) => sum + Number(load.loaded_miles),
      0,
    );
    return { month, rpm: miles > 0 ? revenue / miles : null };
  });
};

// ---- OUTSTANDING LOAD SHAPE ----
export interface OutstandingLoad {
  load_id: string;
  load_number: string;
  broker: string;
  revenue: number;
  daysOutstanding: number;
}

export interface OutstandingSummary {
  total: number;
  medianDaysOutstanding: number | null; // typical aging — robust to one stuck invoice
  oldestDaysOutstanding: number | null; // the tail, surfaced rather than hidden
}

// Total unpaid $ and aging across the outstanding loads. We headline the MEDIAN
// aging (one disputed invoice sitting for months shouldn't drag the typical
// number) and expose the oldest as the tail. NOTE: this is aging of currently-
// unpaid loads, not true days-to-pay (that needs a payment date we don't track
// yet).
export const getOutstandingSummary = (
  outstanding: OutstandingLoad[],
): OutstandingSummary => {
  if (outstanding.length === 0)
    return { total: 0, medianDaysOutstanding: null, oldestDaysOutstanding: null };
  const total = outstanding.reduce((sum, o) => sum + o.revenue, 0);
  const days = outstanding.map((o) => o.daysOutstanding);
  return {
    total,
    medianDaysOutstanding: median(days),
    oldestDaysOutstanding: Math.max(...days),
  };
};

// ---- GET OUTSTANDING LOADS ---- (delivered + unpaid/invoiced, aged from delivery, oldest first)
export const getOutstandingLoads = (loads: Load[]): OutstandingLoad[] => {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const now = Date.now();

  const outstanding = loads.filter(
    (load) =>
      load.load_status === "delivered" &&
      (load.payment_status === "unpaid" ||
        load.payment_status === "invoiced") &&
      load.delivery_date,
  );

  return outstanding
    .map((load) => {
      const deliveredTime = new Date(load.delivery_date as string).getTime();
      const daysOutstanding = Math.floor((now - deliveredTime) / MS_PER_DAY);
      return {
        load_id: load.load_id,
        load_number: load.load_number,
        broker: load.broker,
        revenue: getLoadRevenue([load]) ?? 0,
        daysOutstanding,
      };
    })
    .sort((a, b) => b.daysOutstanding - a.daysOutstanding); // oldest (most days) first
};

// ---- LOADS DELIVERED: THIS MONTH vs LAST ----
export interface MonthlyLoadCount {
  thisMonth: number;
  lastMonth: number;
}

export const getLoadsMonthly = (loads: Load[]): MonthlyLoadCount => {
  const now = new Date(Date.now());
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const prev = new Date(Date.UTC(year, month - 1, 1)); // handles Jan → Dec

  const countIn = (y: number, m: number): number =>
    loads.filter(
      (load) =>
        load.load_status === "delivered" &&
        load.delivery_date &&
        new Date(load.delivery_date).getUTCFullYear() === y &&
        new Date(load.delivery_date).getUTCMonth() === m,
    ).length;

  return {
    thisMonth: countIn(year, month),
    lastMonth: countIn(prev.getUTCFullYear(), prev.getUTCMonth()),
  };
};

// ---- TOP AGENTS BY GROSS ---- (delivered loads, grouped by agent)
// `revenue` here is the agent's total GROSS (the full customer rate). Agents are
// graded on the market value they bring, NOT Jason's net — net would penalize a
// good booking for his deadhead/cost, which the agent doesn't control. Gross is
// used for agents/lanes/targets app-wide (owner dashboard too). Assets stay net.
export interface AgentRevenue {
  agentId: string;
  agent: string;
  revenue: number; // GROSS
  loadCount: number;
}

const agentGross = (loads: Load[]): number =>
  loads.reduce((sum, l) => sum + loadGross(l), 0);

// Two guards, two failure modes: `windowDays` drops stale agents (a great load
// six months ago falls out of the window); `minLoads` drops one-offs (a single
// lucky run doesn't rank). loadCount + gross are both returned so the ranking
// self-explains.
const collectRecentAgents = (
  loads: Load[],
  windowDays: number,
  minLoads: number,
): AgentRevenue[] => {
  const cutoff = Date.now() - windowDays * 86_400_000;
  const recent = loads.filter(
    (load) =>
      load.load_status === "delivered" &&
      load.delivery_date &&
      new Date(load.delivery_date).getTime() >= cutoff,
  );

  const byAgent = new Map<string, Load[]>();
  for (const load of recent) {
    const bucket = byAgent.get(load.agent_id);
    if (bucket) bucket.push(load);
    else byAgent.set(load.agent_id, [load]);
  }

  const ranked: AgentRevenue[] = [];
  for (const [agentId, agentLoads] of byAgent) {
    if (agentLoads.length < minLoads) continue; // volume floor
    ranked.push({
      agentId,
      agent: agentLoads[0].agent,
      revenue: agentGross(agentLoads),
      loadCount: agentLoads.length,
    });
  }
  return ranked;
};

export const getTopAgentsByRevenue = (
  loads: Load[],
  windowDays = 90,
  minLoads = 2,
  limit = 5,
): AgentRevenue[] =>
  collectRecentAgents(loads, windowDays, minLoads)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);

// The full agent directory for the dispatch Agents table: every agent with a
// delivered load, lifetime load count + gross, sorted by gross. The component
// searches / re-sorts / paginates this.
export const getAgentGrossTable = (loads: Load[]): AgentRevenue[] => {
  const byAgent = new Map<string, Load[]>();
  for (const load of loads) {
    if (load.load_status !== "delivered") continue;
    const bucket = byAgent.get(load.agent_id);
    if (bucket) bucket.push(load);
    else byAgent.set(load.agent_id, [load]);
  }

  const rows: AgentRevenue[] = [];
  for (const [agentId, agentLoads] of byAgent) {
    rows.push({
      agentId,
      agent: agentLoads[0].agent,
      revenue: agentGross(agentLoads),
      loadCount: agentLoads.length,
    });
  }
  return rows.sort((a, b) => b.revenue - a.revenue);
};

// ---- UPCOMING LOADS ---- (booked / in-transit, soonest pickup first)
export interface UpcomingLoad {
  load_id: string;
  load_number: string;
  lane: string;
  pickup_date: string;
  agent: string; // who booked it
  gross: number; // all-in booked value (market rate, matches "committed & booked")
  oversize: boolean; // load_type reads oversize → OVR badge
}

export const getUpcomingLoads = (loads: Load[], limit = 5): UpcomingLoad[] => {
  const upcoming = loads.filter(
    (load) =>
      (load.load_status === "booked" || load.load_status === "in_transit") &&
      load.pickup_date,
  );

  upcoming.sort((a, b) => a.pickup_date.localeCompare(b.pickup_date));

  return upcoming.slice(0, limit).map((load) => ({
    load_id: load.load_id,
    load_number: load.load_number,
    lane: `${load.origin_market} → ${load.delivery_market}`,
    pickup_date: load.pickup_date,
    agent: load.agent,
    gross:
      Number(load.linehaul) +
      Number(load.fuel_surcharge) +
      Number(load.total_accessorials),
    oversize: /over/i.test(load.load_type ?? ""),
  }));
};

// ---- RECENT DELIVERED LOADS ---- (newest first, for the "just happened" feed)
export interface RecentLoad {
  load_id: string;
  load_number: string;
  lane: string;
  delivery_date: string;
  revenue: number;
}

export const getRecentDeliveredLoads = (
  loads: Load[],
  limit = 5,
): RecentLoad[] => {
  const delivered = loads.filter(
    (load) => load.load_status === "delivered" && load.delivery_date,
  );

  delivered.sort((a, b) =>
    (b.delivery_date as string).localeCompare(a.delivery_date as string),
  );

  return delivered.slice(0, limit).map((load) => ({
    load_id: load.load_id,
    load_number: load.load_number,
    lane: `${load.origin_market} → ${load.delivery_market}`,
    delivery_date: load.delivery_date as string,
    revenue: getLoadRevenue([load]) ?? 0,
  }));
};
