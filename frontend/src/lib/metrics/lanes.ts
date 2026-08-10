import type { Load } from "@/types/load";
import {
  getRegion,
  getStateName,
  getMacro,
  getStateAbbr,
  UNKNOWN_REGION,
} from "@/lib/constants/states";
import { median } from "./stats";
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
  medianRpm: number | null;
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
          gross: grossRevenue(laneLoads),
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
      medianRpm: medianRpm(stateLoads),
      markets: [...new Set(stateLoads.map((l) => l.origin_market))],
    };
  }

  return out;
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

// Same, but from a full state name (what the topology gives the map component).
export const groupKeyForStateName = (
  name: string,
  level: MapLevel,
): string | null => {
  if (level === "state") return name;
  return groupKeyForState(getStateAbbr(name), level);
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

export interface StateDetail {
  state: string;
  loadCount: number;
  avgRpm: number | null;
  medianRpm: number | null;
  agents: AgentStat[]; // who you've booked out of here, most-used first
  lanes: LaneStat[]; // your lanes out of here, most-run first
}

// Shared drill-down builder: the agents you've booked out of an already-scoped
// set of delivered loads (rate / volume / on-time) and your top lanes from it.
// `freeHours` drives on-time (from settlement). `label` names the area.
const buildDetail = (
  scopedLoads: Load[],
  label: string,
  freeHours: number,
): StateDetail => {
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

  const lanes: LaneStat[] = [];
  for (const [, laneLoads] of groupBy(
    scopedLoads,
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
    });
  }
  lanes.sort(
    (a, b) => b.loadCount - a.loadCount || (b.medianRpm ?? 0) - (a.medianRpm ?? 0),
  );

  return {
    state: label,
    loadCount: scopedLoads.length,
    avgRpm: avgRpm(scopedLoads),
    medianRpm: medianRpm(scopedLoads),
    agents,
    lanes,
  };
};

// Drill-down for a clicked origin STATE (the 90d level).
export const getStateDetail = (
  loads: Load[],
  stateName: string,
  freeHours: number,
  days: number,
  now: number = Date.now(),
): StateDetail => {
  const recent = getRecentLoads(deliveredOnly(loads), days, now);
  const stateLoads = recent.filter(
    (l) => getStateName(l.origin_state) === stateName,
  );
  return buildDetail(stateLoads, stateName, freeHours);
};

// Drill-down for a clicked region / macro blob (the 60d / 30d levels): the same
// agents-and-lanes read, scoped to every origin state inside that group.
export const getAreaDetail = (
  loads: Load[],
  level: MapLevel,
  key: string,
  freeHours: number,
  days: number,
  now: number = Date.now(),
): StateDetail => {
  if (level === "state") return getStateDetail(loads, key, freeHours, days, now);
  const recent = getRecentLoads(deliveredOnly(loads), days, now);
  const areaLoads = recent.filter(
    (l) => groupKeyForState(l.origin_state, level) === key,
  );
  return buildDetail(areaLoads, key, freeHours);
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

// ---- The statusbar answering line: what the window did, in three numbers. ----
export interface WindowTotals {
  loads: number;
  linehaul: number;
  blendedRpm: number | null; // linehaul ÷ loaded miles across the set
}

export const getWindowTotals = (loads: Load[]): WindowTotals => {
  let lh = 0;
  let mi = 0;
  for (const l of loads) {
    lh += Number(l.linehaul) || 0;
    mi += Number(l.loaded_miles) || 0;
  }
  return { loads: loads.length, linehaul: lh, blendedRpm: mi > 0 ? lh / mi : null };
};

// ---- Origin states for the markets board. ----
// Spot oversize rarely repeats a lane, but origins recur — where the freight
// is born is the ranking that means something. Repeats (≥2 loads) rank by
// volume then rate; singles ride the map, not the board. Best origin = the
// strongest blended rate among repeats.
export interface OriginStateStat {
  state: string; // 2-letter code
  name: string; // full name, for the row
  loadCount: number;
  blendedRpm: number | null;
}

export interface OriginStateRollup {
  rows: OriginStateStat[]; // repeats only, volume desc then rate desc
  singles: number; // origins with exactly one load
  best: OriginStateStat | null;
}

export const getOriginStateRollup = (loads: Load[]): OriginStateRollup => {
  const acc = new Map<string, { n: number; lh: number; mi: number }>();
  for (const l of loads) {
    const st = l.origin_state;
    if (!st) continue;
    const a = acc.get(st) ?? { n: 0, lh: 0, mi: 0 };
    a.n += 1;
    a.lh += Number(l.linehaul) || 0;
    a.mi += Number(l.loaded_miles) || 0;
    acc.set(st, a);
  }
  const all = [...acc.entries()].map(([state, a]) => ({
    state,
    name: getStateName(state) ?? state,
    loadCount: a.n,
    blendedRpm: a.mi > 0 ? a.lh / a.mi : null,
  }));
  const rows = all
    .filter((r) => r.loadCount >= 2)
    .sort(
      (a, b) =>
        b.loadCount - a.loadCount ||
        (b.blendedRpm ?? -1) - (a.blendedRpm ?? -1) ||
        a.state.localeCompare(b.state),
    );
  let best: OriginStateStat | null = null;
  for (const r of rows)
    if (r.blendedRpm != null && (best?.blendedRpm == null || r.blendedRpm > best.blendedRpm))
      best = r;
  return { rows, singles: all.length - rows.length, best };
};
