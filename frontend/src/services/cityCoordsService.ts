import api from "./api";

// A verified city center from the persistent cache (city_norm already normalized).
export interface CityCoordRow {
  city_norm: string;
  state: string;
  lat: number;
  lng: number;
}

// Every verified coordinate. Non-fatal on failure — the Foreman just falls back
// to region-level ordering when the map is empty.
export const getCityCoords = async (): Promise<CityCoordRow[]> => {
  try {
    const response = await api.get("/city-coords");
    return response.data.coords ?? [];
  } catch {
    return [];
  }
};

// Warm the cache for the cities on the current board. Fire-and-forget: the server
// geocodes any missing ones in the background, so this returns fast and the next
// fetch is precise. Failures are swallowed (distances just stay region-level).
export const warmCityCoords = async (
  cities: { city: string; state: string }[],
): Promise<CityCoordRow[]> => {
  try {
    const response = await api.post("/city-coords/ensure", { cities });
    return response.data.coords ?? [];
  } catch {
    return [];
  }
};
