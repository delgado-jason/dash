import { useState, useEffect } from "react";
import type { Load } from "@/types/load";
import { getCityCoords, warmCityCoords, type CityCoordRow } from "@/services/cityCoordsService";
import { cityKey, type CoordMap } from "@/lib/metrics/foreman";

const toMap = (rows: CityCoordRow[]): CoordMap => {
  const m: CoordMap = new Map();
  for (const r of rows) m.set(cityKey(r.city_norm, r.state), { lat: r.lat, lng: r.lng });
  return m;
};

// The trusted city-coordinate lookup for the Foreman. Fetches what's already
// verified (fast), then warms the cache for every city on the current board and
// refetches once so a first-ever visit sharpens from region-level to real miles
// within a few seconds — all in the background, no user involvement.
export const useCityCoords = (loads: Load[]): CoordMap => {
  const [map, setMap] = useState<CoordMap>(new Map());

  useEffect(() => {
    let active = true;
    getCityCoords().then((rows) => active && setMap(toMap(rows)));

    if (!loads.length) return () => { active = false; };

    // distinct cities on the board (origins + destinations)
    const seen = new Set<string>();
    const cities: { city: string; state: string }[] = [];
    for (const l of loads) {
      for (const [c, s] of [
        [l.origin_city, l.origin_state],
        [l.destination_city, l.destination_state],
      ] as const) {
        const k = cityKey(c, s);
        if (c && s && !seen.has(k)) {
          seen.add(k);
          cities.push({ city: c, state: s });
        }
      }
    }

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
  }, [loads]);

  return map;
};
