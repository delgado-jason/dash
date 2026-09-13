import { useState, useEffect } from "react";
import type { Load } from "@/types/load";
import { getCityCoords, warmCityCoords, type CityCoordRow } from "@/services/cityCoordsService";
import { cityKey, type CoordMap, type CoveragePointLike } from "@/lib/metrics/foreman";

const toMap = (rows: CityCoordRow[]): CoordMap => {
  const m: CoordMap = new Map();
  for (const r of rows) m.set(cityKey(r.city_norm, r.state), { lat: r.lat, lng: r.lng });
  return m;
};

// The default for callers with no coverage rows must be the SAME array every
// render — a fresh `[]` in the signature would restart the effect below on
// every paint (the trap LoadForm already documents for `loads`).
const NO_COVERAGE: CoveragePointLike[] = [];

// The trusted city-coordinate lookup for the Foreman. Fetches what's already
// verified (fast), then warms the cache for every city on the current board and
// refetches once so a first-ever visit sharpens from region-level to real miles
// within a few seconds — all in the background, no user involvement.
//
// "Every city on the board" is loads AND the markets agents claimed (decision
// 6A): a claimed market is a footprint point measured exactly like a proved
// one, so Harrison's Meridian, MS has to hold a coordinate or his claim ranks
// by region instead of the 95 miles it actually is.
export const useCityCoords = (
  loads: Load[],
  coverage: CoveragePointLike[] = NO_COVERAGE,
): CoordMap => {
  const [map, setMap] = useState<CoordMap>(new Map());

  useEffect(() => {
    let active = true;
    getCityCoords().then((rows) => active && setMap(toMap(rows)));

    if (!loads.length && !coverage.length) return () => { active = false; };

    // distinct cities on the board (load origins + destinations + claims)
    const seen = new Set<string>();
    const cities: { city: string; state: string }[] = [];
    const add = (c?: string | null, s?: string | null) => {
      const k = cityKey(c, s);
      if (c && s && !seen.has(k)) {
        seen.add(k);
        cities.push({ city: c, state: s });
      }
    };
    for (const l of loads) {
      add(l.origin_city, l.origin_state);
      add(l.destination_city, l.destination_state);
    }
    for (const c of coverage) add(c.city, c.state);

    let timer: ReturnType<typeof setTimeout> | undefined;
    warmCityCoords(cities).then(() => {
      // ensure returns immediately while it geocodes in the background — give it a
      // moment, then pick up any newly-verified coordinates.
      timer = setTimeout(() => {
        getCityCoords().then((rows) => active && setMap(toMap(rows)));
      }, 5000);
    });

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [loads, coverage]);

  return map;
};
