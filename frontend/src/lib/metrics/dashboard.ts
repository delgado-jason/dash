import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import { loadRevenue } from "./rateTargets";

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
  const now = new Date();

  const filteredLoads = loads.filter(
    (load) =>
      load.delivery_date &&
      load.load_status === "delivered" &&
      new Date(load.delivery_date).getUTCFullYear() === now.getUTCFullYear() &&
      new Date(load.delivery_date).getUTCMonth() === now.getUTCMonth() - 1,
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

// ---- GET DEADHEAD PERCENTAGE ----
export const getDeadheadPercent = (loads: Load[]) => {
  const validLoads = loads.filter(
    (load) =>
      load.odometer_start !== null &&
      load.odometer_end !== null &&
      load.load_status === "delivered",
  );

  const totalOdometer = validLoads.reduce((sum, load) => {
    return sum + (Number(load.odometer_end) - Number(load.odometer_start));
  }, 0);

  const totalLoaded = validLoads.reduce((sum, load) => {
    return sum + Number(load.loaded_miles);
  }, 0);

  if (totalOdometer === 0) return null;

  return (totalOdometer - totalLoaded) / totalOdometer;
};

// ---- MONTHLY DEADHEAD ---- (this month vs last month, trips included)

export interface MonthlyDeadhead {
  thisMonth: number | null;
  lastMonth: number | null;
}

// Deadhead % for a single UTC month. Empty miles = delivered loads' odometer
// windows minus their loaded miles, PLUS every qualifying trip's full odometer
// window (trips are 100% non-revenue). Payment status is irrelevant — only
// load_status "delivered" ran (cancelled/tonu did not); all trip purposes count.
// Both loads and trips need both odometer readings. Returns null when the month
// has no qualifying miles at all.
const deadheadForMonth = (
  loads: Load[],
  trips: Trip[],
  year: number,
  month: number,
): number | null => {
  const monthLoads = loads.filter(
    (load) =>
      load.load_status === "delivered" &&
      load.odometer_start != null &&
      load.odometer_end != null &&
      load.delivery_date &&
      new Date(load.delivery_date).getUTCFullYear() === year &&
      new Date(load.delivery_date).getUTCMonth() === month,
  );

  const monthTrips = trips.filter(
    (trip) =>
      trip.odometer_start != null &&
      trip.odometer_end != null &&
      trip.trip_date &&
      new Date(trip.trip_date).getUTCFullYear() === year &&
      new Date(trip.trip_date).getUTCMonth() === month,
  );

  const loadWindow = monthLoads.reduce(
    (sum, load) =>
      sum + (Number(load.odometer_end) - Number(load.odometer_start)),
    0,
  );
  const tripWindow = monthTrips.reduce(
    (sum, trip) =>
      sum + (Number(trip.odometer_end) - Number(trip.odometer_start)),
    0,
  );
  const totalMiles = loadWindow + tripWindow;

  const loadedMiles = monthLoads.reduce(
    (sum, load) => sum + Number(load.loaded_miles),
    0,
  );

  if (totalMiles === 0) return null;

  return (totalMiles - loadedMiles) / totalMiles;
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
  avgDaysOutstanding: number | null;
}

// Total unpaid $ and average aging across the outstanding loads. NOTE: this is
// aging of currently-unpaid loads, not true days-to-pay (that needs a payment
// date we don't track yet).
export const getOutstandingSummary = (
  outstanding: OutstandingLoad[],
): OutstandingSummary => {
  if (outstanding.length === 0) return { total: 0, avgDaysOutstanding: null };
  const total = outstanding.reduce((sum, o) => sum + o.revenue, 0);
  const avg =
    outstanding.reduce((sum, o) => sum + o.daysOutstanding, 0) /
    outstanding.length;
  return { total, avgDaysOutstanding: avg };
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

// ---- TOP AGENTS BY REVENUE ---- (delivered loads, grouped by agent)
export interface AgentRevenue {
  agentId: string;
  agent: string;
  revenue: number;
  loadCount: number;
}

// Two guards, two failure modes: `windowDays` drops stale agents (a great load
// six months ago falls out of the window); `minLoads` drops one-offs (a single
// lucky run doesn't rank). loadCount is returned so the ranking self-explains.
export const getTopAgentsByRevenue = (
  loads: Load[],
  windowDays = 90,
  minLoads = 2,
  limit = 5,
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
      revenue: getLoadRevenue(agentLoads) ?? 0,
      loadCount: agentLoads.length,
    });
  }

  ranked.sort((a, b) => b.revenue - a.revenue);
  return ranked.slice(0, limit);
};

// ---- UPCOMING LOADS ---- (booked / in-transit, soonest pickup first)
export interface UpcomingLoad {
  load_id: string;
  load_number: string;
  lane: string;
  pickup_date: string;
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
