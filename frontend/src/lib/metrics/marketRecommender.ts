import type { Load } from "@/types/load";
import type { Market } from "@/types/market";
import { cityKey, haversineMiles, type CoordMap } from "./foreman";
import { nearestHub, regionalMarketName } from "./freightHubs";

// A stop's market is defined by its LOCATION: all freight within this radius of a
// freight hub belongs to that hub's market (docs/business-rules/001).
export const MARKET_RADIUS_MI = 75;

// The confidence ladder — higher tier = weaker signal, first hit wins.
//   1 = same shipper/receiver seen before -> reuse its market
//   2 = same city seen before             -> reuse its market
//   3 = typed city IS an existing market  -> the hub itself (e.g. "Atlanta")
//   4 = a mapped history city within 75mi -> reuse the nearest one's market
//   5 = a seeded freight hub within 75mi  -> "[Hub] Market" (create if new)
//   6 = no hub within 75mi                -> "[Direction] [State] Market" (create if new)
// Tiers 1-4 always resolve to an existing market; 5-6 may need creating (isNew).
export type MarketRecTier = 1 | 2 | 3 | 4 | 5 | 6;

export interface MarketRecommendation {
  tier: MarketRecTier;
  // The existing market to use, or null when the market must be created (isNew).
  market_id: string | null;
  market_name: string;
  // True when market_id is null and the chip should CREATE the market first.
  isNew: boolean;
  // Short human reason for the chip, e.g. "Same shipper · 3 past loads".
  reason: string;
  // Straight-line miles, on the proximity tiers (4 and 5).
  distanceMi?: number;
}

export type MarketRole = "origin" | "destination";

const norm = (s?: string | null): string => String(s ?? "").trim().toUpperCase();

// "Atlanta Market" -> "Atlanta" (also handles the regional "[Direction] [State]
// Market" form, which just won't match a plain city).
const stripMarketSuffix = (name: string): string =>
  name.replace(/\s+market\s*$/i, "").trim();

interface StopRef {
  city: string;
  state: string;
  facility: string; // normalized shipper/receiver name ("" when absent)
  market_id: string;
  pickup_date: string;
}

// Every (location, facility) -> market observation in history, from BOTH roles: a
// place's market is the same whoever it shipped/received for, so all sightings count.
//
// The loads LIST endpoint returns the market NAME (origin_market / delivery_market)
// but NOT the id — only the single-load fetch carries ids — so resolve the id from
// the name against the market list when it's missing. Without this the whole ladder
// silently finds nothing off the list.
const collectStops = (loads: Load[], idByName: Map<string, string>): StopRef[] => {
  const out: StopRef[] = [];
  const resolve = (id?: string | null, name?: string | null): string | null =>
    id || idByName.get(norm(name)) || null;
  for (const l of loads) {
    const originId = resolve(l.origin_market_id, l.origin_market);
    if (originId) {
      out.push({
        city: l.origin_city,
        state: l.origin_state,
        facility: norm(l.shipper_name),
        market_id: originId,
        pickup_date: l.pickup_date,
      });
    }
    const destId = resolve(l.destination_market_id, l.delivery_market);
    if (destId) {
      out.push({
        city: l.destination_city,
        state: l.destination_state,
        facility: norm(l.receiver_name),
        market_id: destId,
        pickup_date: l.pickup_date,
      });
    }
  }
  return out;
};

// The dominant market among a set of sightings: most frequent, ties broken by the
// most recent pickup. Defends against any residual "same place, two markets" split
// by recommending the one you've used most (and, on a tie, most recently).
const dominantMarket = (
  sightings: StopRef[],
): { market_id: string; count: number } | null => {
  if (sightings.length === 0) return null;
  const byMarket = new Map<string, { count: number; latest: string }>();
  for (const s of sightings) {
    const cur = byMarket.get(s.market_id);
    if (!cur) {
      byMarket.set(s.market_id, { count: 1, latest: s.pickup_date });
    } else {
      cur.count += 1;
      if (s.pickup_date > cur.latest) cur.latest = s.pickup_date;
    }
  }
  let winner: string | null = null;
  let best = { count: -1, latest: "" };
  for (const [market_id, v] of byMarket) {
    if (v.count > best.count || (v.count === best.count && v.latest > best.latest)) {
      winner = market_id;
      best = v;
    }
  }
  return winner ? { market_id: winner, count: best.count } : null;
};

const plural = (n: number): string => (n === 1 ? "load" : "loads");

// Recommend a market for a prospective stop by climbing your own history. Returns
// null when nothing in the ladder hits (Phase 2 adds the canonical fallback).
export const recommendMarket = (params: {
  role: MarketRole;
  facilityName?: string | null;
  city?: string | null;
  state?: string | null;
  loads: Load[];
  markets: Market[];
  coords: CoordMap;
}): MarketRecommendation | null => {
  const { facilityName, city, state, loads, markets, coords } = params;

  const nameById = new Map(markets.map((m) => [m.market_id, m.market_name]));
  const idByName = new Map(markets.map((m) => [norm(m.market_name), m.market_id]));
  const label = params.role === "origin" ? "shipper" : "receiver";
  const stops = collectStops(loads, idByName);

  // A market_id only counts if it still exists in the current market list.
  const resolvable = (market_id: string): boolean => nameById.has(market_id);

  // --- Tier 1: same facility (shipper/receiver) ------------------------------
  // A facility NAME is not unique to one place — a national manufacturer can run
  // plants in several states (real example: Johns Manville in PA and AL). So a
  // name match alone can cross plants. Disambiguate by the entered state; with no
  // state yet, only trust the name when it maps to a single market.
  const facKey = norm(facilityName);
  const stateKey = norm(state);
  if (facKey) {
    let hits = stops.filter((s) => s.facility === facKey && resolvable(s.market_id));
    if (stateKey) {
      hits = hits.filter((s) => norm(s.state) === stateKey);
    } else if (new Set(hits.map((h) => h.market_id)).size > 1) {
      hits = []; // ambiguous multi-plant facility, no state to pick — defer to city tiers
    }
    const dom = dominantMarket(hits);
    if (dom) {
      return {
        tier: 1,
        market_id: dom.market_id,
        market_name: nameById.get(dom.market_id)!,
        isNew: false,
        reason: `Same ${label} · ${dom.count} past ${plural(dom.count)}`,
      };
    }
  }

  // --- Tier 2: same city -----------------------------------------------------
  const hereKey = cityKey(city, state);
  const hasHere = norm(city) !== "" && norm(state) !== "";
  if (hasHere) {
    const hits = stops.filter(
      (s) => cityKey(s.city, s.state) === hereKey && resolvable(s.market_id),
    );
    const dom = dominantMarket(hits);
    if (dom) {
      return {
        tier: 2,
        market_id: dom.market_id,
        market_name: nameById.get(dom.market_id)!,
        isNew: false,
        reason: `Same city · ${dom.count} past ${plural(dom.count)}`,
      };
    }
  }

  // --- Tier 3: the typed city IS one of your markets (the hub) --------------
  // Load history lives in the SUBURBS, but a market is named for its hub. When
  // someone types the hub itself ("Atlanta"), there's no load AT Atlanta — match
  // it straight to the existing "Atlanta Market".
  const cityN = norm(city);
  if (cityN) {
    const hub = markets.find(
      (m) => norm(stripMarketSuffix(m.market_name)) === cityN,
    );
    if (hub) {
      return {
        tier: 3,
        market_id: hub.market_id,
        market_name: hub.market_name,
        isNew: false,
        reason: "Matches this city's market",
      };
    }
  }

  // --- Tier 4: nearest mapped city within 75 mi ------------------------------
  const here = hasHere ? coords.get(hereKey) : undefined;
  if (here) {
    // Group history by distinct city, each carrying its own dominant market.
    const byCity = new Map<string, StopRef[]>();
    for (const s of stops) {
      const k = cityKey(s.city, s.state);
      if (k === hereKey || !resolvable(s.market_id)) continue;
      const arr = byCity.get(k);
      if (arr) arr.push(s);
      else byCity.set(k, [s]);
    }

    let nearest: {
      market_id: string;
      market_name: string;
      city: string;
      state: string;
      distanceMi: number;
    } | null = null;

    for (const [, arr] of byCity) {
      const there = coords.get(cityKey(arr[0].city, arr[0].state));
      if (!there) continue;
      const d = haversineMiles(here, there);
      if (d > MARKET_RADIUS_MI) continue;
      const dom = dominantMarket(arr);
      if (!dom) continue;
      if (!nearest || d < nearest.distanceMi) {
        nearest = {
          market_id: dom.market_id,
          market_name: nameById.get(dom.market_id)!,
          city: arr[0].city,
          state: arr[0].state,
          distanceMi: d,
        };
      }
    }

    if (nearest) {
      return {
        tier: 4,
        market_id: nearest.market_id,
        market_name: nearest.market_name,
        isNew: false,
        reason: `Nearest mapped city · ${nearest.city}, ${nearest.state} (~${Math.round(nearest.distanceMi)} mi)`,
        distanceMi: nearest.distanceMi,
      };
    }
  }

  // --- Tier 5: nearest seeded freight hub within 75 mi ----------------------
  // A brand-new city with no history: suggest the market of the nearest major
  // freight hub. The hub's market may already exist (use it) or not (create it).
  if (here) {
    const near = nearestHub(here);
    if (near) {
      const name = `${near.hub.city} Market`;
      const id = idByName.get(norm(name)) ?? null;
      return {
        tier: 5,
        market_id: id,
        market_name: name,
        isNew: id === null,
        reason: `Nearest hub · ${near.hub.city} (~${Math.round(near.distanceMi)} mi)`,
        distanceMi: near.distanceMi,
      };
    }
  }

  // --- Tier 6: regional fallback (no hub within 75 mi) ----------------------
  // Genuinely remote: name the market by the part of the state it sits in,
  // "[Direction] [State] Market" (e.g. "Western Texas Market").
  if (here && hasHere) {
    const name = regionalMarketName(here, String(state ?? ""));
    if (name) {
      const id = idByName.get(norm(name)) ?? null;
      return {
        tier: 6,
        market_id: id,
        market_name: name,
        isNew: id === null,
        reason: "Regional · no hub within 75 mi",
      };
    }
  }

  return null;
};
