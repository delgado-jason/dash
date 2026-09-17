import type { Load } from "@/types/load";
import {
  getRegion,
  getStateName,
  getMacro,
  UNKNOWN_REGION,
} from "@/lib/constants/states";
import { median } from "./stats";
import { perDayOver, type PerDayTotals } from "./perDay";
import { agentStops, scoreStops } from "./stopScore";

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
  gross: number; // all-in gross over the lane's loads (market value)
  avgRpm: number | null;
  medianRpm: number | null;
  // Typical $/day — WEIGHTED, Σgross ÷ Σdays over the delivered loads here
  // (lib/metrics/perDay). Never a mean of per-load rates: a five-day haul
  // owns five days of the truck and has to weigh five times as much.
  // `.perDay` is null when none of the loads carry both dates; `.loads` is how
  // many of `loadCount` actually fed it, which is what the colour gates on.
  perDay: PerDayTotals;
}

export interface MarketStat {
  market: string;
  loadCount: number;
  avgRpm: number | null;
  medianRpm: number | null;
  perDay: PerDayTotals; // weighted — see LaneStat.perDay
  lanes: LaneStat[];
}

export interface RegionStat {
  region: string;
  loadCount: number;
  avgRpm: number | null;
  medianRpm: number | null;
  perDay: PerDayTotals; // weighted — see LaneStat.perDay
  markets: MarketStat[];
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

// Typical $/day for a set of lane loads — weighted, one rule, shared with
// every other surface that shows a $/day. The whole totals object, not just
// the rate: the table colours on how many loads actually FED the figure, and
// the group's load count is not that number (a load with no pickup date is in
// the group and out of the figure).
const perDayOf = (loads: Load[]): PerDayTotals => perDayOver(loads);

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
          gross: grossRevenue(laneLoads),
          avgRpm: avgRpm(laneLoads),
          medianRpm: medianRpm(laneLoads),
          perDay: perDayOf(laneLoads),
        });
      }

      lanes.sort((a, b) => (b.medianRpm ?? -1) - (a.medianRpm ?? -1));
      markets.push({
        market,
        loadCount: marketLoads.length,
        avgRpm: avgRpm(marketLoads),
        medianRpm: medianRpm(marketLoads),
        perDay: perDayOf(marketLoads),
        lanes,
      });
    }

    markets.sort((a, b) => b.loadCount - a.loadCount);
    regions.push({
      region,
      loadCount: regionLoads.length,
      avgRpm: avgRpm(regionLoads),
      medianRpm: medianRpm(regionLoads),
      perDay: perDayOf(regionLoads),
      markets,
    });
  }

  regions.sort((a, b) => b.loadCount - a.loadCount);
  return regions;
};

// ---- GRANULARITY-AWARE MAP DATA ----
// The map's spatial resolution follows the window: a short (sparse) window
// groups coarsely so it still reads, a longer window can afford fine detail.
// State ⊂ freight-region ⊂ macro-region — each level is just a grouping of the
// same origin-state geography, so no coordinates/geocoding are needed.
export type MapLevel = "macro" | "region" | "state";

// 30d → macro (≈4 blobs), 60d → freight region (≈9), 90d → state (48).
export const levelForWindow = (days: number): MapLevel =>
  days <= 30 ? "macro" : days <= 60 ? "region" : "state";

// The group a load's origin state belongs to at a given level. State level uses
// the full state NAME (the map topology keys on names); region/macro use the
// freight-region / macro label. null = unrecognized origin state (skip it).
export const groupKeyForState = (
  originStateAbbr: string | null | undefined,
  level: MapLevel,
): string | null => {
  const name = getStateName(originStateAbbr);
  if (!name) return null;
  if (level === "state") return name;
  const key = level === "macro" ? getMacro(originStateAbbr) : getRegion(originStateAbbr);
  return key === UNKNOWN_REGION ? null : key;
};

export interface AreaMapDatum {
  key: string; // state name, or region / macro label
  loadCount: number; // delivered loads in the window
  gross: number; // all-in gross originating here (market value)
  avgRpm: number | null; // blended gross ÷ loaded mile
  medianRpm: number | null; // typical single-load $/mi (drives rate shading)
  members: string[]; // origin markets (state level) or member states (grouped)
}

// Choropleth data at the level the window implies, over the window itself (no
// separate footprint — the tab drives both time and grouping). Keyed by group
// key so the map can shade each shape and list its members on hover.
export const getAreaMapData = (
  loads: Load[],
  days: number,
  level: MapLevel,
  now: number = Date.now(),
): Record<string, AreaMapDatum> => {
  const recent = getRecentLoads(deliveredOnly(loads), days, now);
  const out: Record<string, AreaMapDatum> = {};

  for (const [key, group] of groupBy(
    recent,
    (l) => groupKeyForState(l.origin_state, level) ?? " ",
  )) {
    if (key === " ") continue; // unrecognized origin states
    const members =
      level === "state"
        ? [...new Set(group.map((l) => l.origin_market))]
        : [
            ...new Set(
              group.map((l) => getStateName(l.origin_state)).filter((n): n is string => !!n),
            ),
          ];
    out[key] = {
      key,
      loadCount: group.length,
      gross: grossRevenue(group),
      avgRpm: avgRpm(group),
      medianRpm: medianRpm(group),
      members,
    };
  }
  return out;
};

// ---- LOAD-TYPE MIX ---- (delivered loads grouped by load_type, by gross)
export interface LoadTypeSlice {
  type: string;
  gross: number;
  loadCount: number;
  share: number; // 0..1 of total gross
}
export const getLoadTypeMix = (loads: Load[]): LoadTypeSlice[] => {
  const delivered = deliveredOnly(loads);
  const total = grossRevenue(delivered);
  const slices: LoadTypeSlice[] = [];
  for (const [type, ls] of groupBy(delivered, (l) => l.load_type?.trim() || "Other")) {
    const g = grossRevenue(ls);
    slices.push({ type, gross: g, loadCount: ls.length, share: total > 0 ? g / total : 0 });
  }
  return slices.sort((a, b) => b.gross - a.gross);
};

// The single origin area (state / region / macro) contributing the most gross in
// the window, with its share of the book — for the "top origin" KPI.
export interface TopOrigin {
  key: string;
  gross: number;
  loadCount: number;
  loadShare: number; // 0..1 of delivered loads in the window
}
export const getTopOrigin = (
  mapData: Record<string, AreaMapDatum>,
): TopOrigin | null => {
  const areas = Object.values(mapData);
  if (areas.length === 0) return null;
  const totalLoads = areas.reduce((s, a) => s + a.loadCount, 0);
  const top = areas.reduce((b, a) => (a.gross > b.gross ? a : b));
  return {
    key: top.key,
    gross: top.gross,
    loadCount: top.loadCount,
    loadShare: totalLoads > 0 ? top.loadCount / totalLoads : 0,
  };
};

// ---- STATE DRILL-DOWN ----
export interface AgentStat {
  agentId: string;
  agent: string;
  loadCount: number;
  medianRpm: number | null;
  onTimePct: number | null; // 0..1 of graded stops on time; null when none graded
}

// The agents you've booked out of an already-scoped set of delivered loads —
// rate, volume, on-time — most-used first. `freeHours` (from the settlement
// schedule) is what on-time is graded against.
//
// One place, because two surfaces ask the same question: the Lanes page's
// market detail ("agents you've booked out of PA") and anything else that
// drills into a scoped slice of the book.
export const agentRows = (
  scopedLoads: Load[],
  freeHours: number,
): AgentStat[] => {
  const agents: AgentStat[] = [];
  for (const [agentId, agentLoads] of groupBy(scopedLoads, (l) => l.agent_id)) {
    agents.push({
      agentId,
      agent: agentLoads[0].agent,
      loadCount: agentLoads.length,
      medianRpm: medianRpm(agentLoads),
      onTimePct: scoreStops(agentStops(agentLoads, freeHours)).onTimePct,
    });
  }
  agents.sort(
    (a, b) => b.loadCount - a.loadCount || (b.medianRpm ?? 0) - (a.medianRpm ?? 0),
  );
  return agents;
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

