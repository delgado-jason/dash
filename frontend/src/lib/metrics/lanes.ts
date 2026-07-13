import type { Load } from "@/types/load";
import { getRegion, getStateName } from "@/lib/constants/states";
import { median } from "./stats";

// Minimum loads before a lane/market can win an RPM-based KPI — keeps a single
// lucky run from crowning a corridor. Volume KPIs ignore this.
export const MIN_KPI_LOADS = 3;

// avgRpm = blended (revenue ÷ miles), what you actually earned per mile.
// medianRpm = the typical single load's $/mile — robust to one high-accessorial
// fluke, and what the RPM KPIs rank on.
export interface LaneStat {
  lane: string; // "Origin Market → Destination Market"
  origin: string;
  destination: string;
  loadCount: number;
  avgRpm: number | null;
  medianRpm: number | null;
}

export interface MarketStat {
  market: string;
  loadCount: number;
  avgRpm: number | null;
  medianRpm: number | null;
  lanes: LaneStat[];
}

export interface RegionStat {
  region: string;
  loadCount: number;
  avgRpm: number | null;
  medianRpm: number | null;
  markets: MarketStat[];
}

export interface StateLoadStat {
  state: string; // full name, e.g. "Georgia"
  loadCount: number;
  avgRpm: number | null;
  markets: string[];
}

export interface LanesSummary {
  topRpmLane: LaneStat | null;
  highestVolumeLane: LaneStat | null;
  bestOriginMarket: MarketStat | null;
}

// ---- helpers ----

const deliveredOnly = (loads: Load[]): Load[] =>
  loads.filter((load) => load.load_status === "delivered");

// All-in gross (numeric columns serialize as strings — coerce).
const grossRevenue = (loads: Load[]): number =>
  loads.reduce(
    (sum, load) =>
      sum +
      Number(load.linehaul) +
      Number(load.fuel_surcharge) +
      Number(load.total_accessorials),
    0,
  );

// Blended RPM = gross ÷ loaded miles. null when there are no loaded miles.
const avgRpm = (loads: Load[]): number | null => {
  const miles = loads.reduce((sum, load) => sum + Number(load.loaded_miles), 0);
  if (miles <= 0) return null;
  return grossRevenue(loads) / miles;
};

// A single load's all-in $/loaded-mile (null when it has no loaded miles).
const loadRpm = (load: Load): number | null => {
  const miles = Number(load.loaded_miles);
  if (miles <= 0) return null;
  return (
    (Number(load.linehaul) +
      Number(load.fuel_surcharge) +
      Number(load.total_accessorials)) /
    miles
  );
};

// Typical RPM = median of the per-load rates. Robust to a single oversize load
// with sky-high accessorials that would inflate the blended number — this is
// what "expect on the next load" looks like, so it ranks the KPIs.
const medianRpm = (loads: Load[]): number | null =>
  median(loads.map(loadRpm).filter((r): r is number => r !== null));

const groupBy = <T>(items: T[], key: (item: T) => string): Map<string, T[]> => {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
};

const MS_PER_DAY = 86_400_000;

// Loads whose delivery_date falls within the last `days` (and not in the
// future). `now` defaults to the current time — freeze it in tests. Undated
// loads are dropped (they can't be windowed). This is the page-level recency
// filter applied before the metrics run.
export const getRecentLoads = (
  loads: Load[],
  days: number,
  now: number = Date.now(),
): Load[] => {
  const cutoff = now - days * MS_PER_DAY;
  return loads.filter((load) => {
    if (!load.delivery_date) return false;
    const t = new Date(load.delivery_date).getTime();
    return t >= cutoff && t <= now;
  });
};

// ---- REGION → MARKET → LANE ROLLUP ---- (delivered loads, by origin)
export const getRegionRollup = (loads: Load[]): RegionStat[] => {
  const delivered = deliveredOnly(loads);
  const regions: RegionStat[] = [];

  for (const [region, regionLoads] of groupBy(delivered, (l) =>
    getRegion(l.origin_state),
  )) {
    const markets: MarketStat[] = [];

    for (const [market, marketLoads] of groupBy(
      regionLoads,
      (l) => l.origin_market,
    )) {
      const lanes: LaneStat[] = [];

      for (const [, laneLoads] of groupBy(
        marketLoads,
        (l) => `${l.origin_market} → ${l.delivery_market}`,
      )) {
        const first = laneLoads[0];
        lanes.push({
          lane: `${first.origin_market} → ${first.delivery_market}`,
          origin: first.origin_market,
          destination: first.delivery_market,
          loadCount: laneLoads.length,
          avgRpm: avgRpm(laneLoads),
          medianRpm: medianRpm(laneLoads),
        });
      }

      lanes.sort((a, b) => (b.medianRpm ?? -1) - (a.medianRpm ?? -1));
      markets.push({
        market,
        loadCount: marketLoads.length,
        avgRpm: avgRpm(marketLoads),
        medianRpm: medianRpm(marketLoads),
        lanes,
      });
    }

    markets.sort((a, b) => b.loadCount - a.loadCount);
    regions.push({
      region,
      loadCount: regionLoads.length,
      avgRpm: avgRpm(regionLoads),
      medianRpm: medianRpm(regionLoads),
      markets,
    });
  }

  regions.sort((a, b) => b.loadCount - a.loadCount);
  return regions;
};

// ---- STATE LOAD MAP ---- (for the choropleth; keyed by full state name)
export const getStateLoadMap = (
  loads: Load[],
): Record<string, StateLoadStat> => {
  const delivered = deliveredOnly(loads);
  const out: Record<string, StateLoadStat> = {};

  for (const [abbr, stateLoads] of groupBy(delivered, (l) => l.origin_state)) {
    const name = getStateName(abbr);
    if (!name) continue; // skip blank / unrecognized states
    out[name] = {
      state: name,
      loadCount: stateLoads.length,
      avgRpm: avgRpm(stateLoads),
      markets: [...new Set(stateLoads.map((l) => l.origin_market))],
    };
  }

  return out;
};

export interface StateMapDatum {
  state: string;
  loadCount: number; // footprint window (drives the shading)
  avgRpm: number | null; // rpm window (null when nothing recent)
  markets: string[];
}

// Choropleth data with two windows: load-count "footprint" over a long window
// (default 1 year) for the shading + markets, but avg RPM over the shorter
// selected window so the hover rate stays current. A state can be shaded (ran
// there this year) yet have null avgRpm (nothing in the recent window) — that's
// meaningful ("run here, not lately"), not a gap to hide.
export const getStateMapData = (
  loads: Load[],
  rpmDays: number,
  footprintDays: number = 365,
  now: number = Date.now(),
): Record<string, StateMapDatum> => {
  const footprint = getStateLoadMap(getRecentLoads(loads, footprintDays, now));
  const windowed = getStateLoadMap(getRecentLoads(loads, rpmDays, now));

  const out: Record<string, StateMapDatum> = {};
  for (const [name, fp] of Object.entries(footprint)) {
    out[name] = {
      state: name,
      loadCount: fp.loadCount,
      markets: fp.markets,
      avgRpm: windowed[name]?.avgRpm ?? null,
    };
  }
  return out;
};

// ---- TOP-LANE KPIs ----
export const getLanesSummary = (loads: Load[]): LanesSummary => {
  const rollup = getRegionRollup(loads);
  const lanes = rollup.flatMap((r) => r.markets.flatMap((m) => m.lanes));
  const markets = rollup.flatMap((r) => r.markets);

  const rpmEligibleLanes = lanes.filter(
    (l) => l.loadCount >= MIN_KPI_LOADS && l.medianRpm !== null,
  );
  const rpmEligibleMarkets = markets.filter(
    (m) => m.loadCount >= MIN_KPI_LOADS && m.medianRpm !== null,
  );

  // Rank on the typical (median) rate — the fluke oversize load doesn't crown a
  // corridor it can't repeat.
  const topRpmLane = rpmEligibleLanes.length
    ? rpmEligibleLanes.reduce((best, l) =>
        (l.medianRpm as number) > (best.medianRpm as number) ? l : best,
      )
    : null;

  const highestVolumeLane = lanes.length
    ? lanes.reduce((best, l) => (l.loadCount > best.loadCount ? l : best))
    : null;

  const bestOriginMarket = rpmEligibleMarkets.length
    ? rpmEligibleMarkets.reduce((best, m) =>
        (m.medianRpm as number) > (best.medianRpm as number) ? m : best,
      )
    : null;

  return { topRpmLane, highestVolumeLane, bestOriginMarket };
};
