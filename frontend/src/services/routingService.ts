import api from "./api";

export interface Place {
  city: string;
  state: string;
}

export interface CitySuggestion {
  city: string;
  state: string;
  label: string; // "Dallas, TX"
}

// City typeahead suggestions for a partial query. Non-fatal → [] on any failure,
// so the dropdown just stays quiet and the field types normally.
export const getCitySuggestions = async (
  q: string,
): Promise<CitySuggestion[]> => {
  if (!q || q.trim().length < 2) return [];
  try {
    const res = await api.get("/routing/city-suggest", { params: { q } });
    return res.data.suggestions ?? [];
  } catch {
    return [];
  }
};

// Travel dimensions in inches + gross pounds; drives HERE's oversize routing.
export interface LoadDims {
  widthIn?: number | null;
  heightIn?: number | null;
  lengthIn?: number | null;
  grossWeightLb?: number | null;
}

export interface LoadMiles {
  loadedMiles: number | null;
  deadheadMiles: number | null;
  tollUsd: number | null; // estimated tolls on the loaded leg (bill as accessorial)
}

// Routed miles for a scored load — loaded (pickup → delivery) and deadhead
// (truck → pickup). Non-fatal: any failure returns nulls so the Scorer just
// keeps its typed-in miles. An estimate; the odometer is truth once it runs.
export const getLoadMiles = async (body: {
  truckNow?: Place | null;
  pickup: Place;
  delivery: Place;
  dims?: LoadDims;
}): Promise<LoadMiles> => {
  try {
    const res = await api.post("/routing/load-miles", body);
    return {
      loadedMiles: res.data.loadedMiles ?? null,
      deadheadMiles: res.data.deadheadMiles ?? null,
      tollUsd: res.data.tollUsd ?? null,
    };
  } catch {
    return { loadedMiles: null, deadheadMiles: null, tollUsd: null };
  }
};

// A geocoded point for the mission map.
export interface GeoPoint {
  lat: number;
  lng: number;
  city: string;
  state: string;
}

export interface RouteGeo {
  pickup: GeoPoint | null;
  delivery: GeoPoint | null;
  deadhead: GeoPoint | null; // null when unknown (booked load) or ungeocodable
  loadedMiles: number | null;
}

const EMPTY_ROUTE: RouteGeo = {
  pickup: null,
  delivery: null,
  deadhead: null,
  loadedMiles: null,
};

// Mission-map geometry for a saved load: geocoded pickup/delivery, the deadhead
// origin (only when the load is active), and the loaded miles. Non-fatal → an
// empty route just leaves the text route standing.
export const getLoadRoute = async (loadId: string): Promise<RouteGeo> => {
  try {
    const res = await api.get(`/routing/load-route/${loadId}`);
    return {
      pickup: res.data.pickup ?? null,
      delivery: res.data.delivery ?? null,
      deadhead: res.data.deadhead ?? null,
      loadedMiles: res.data.loadedMiles ?? null,
    };
  } catch {
    return EMPTY_ROUTE;
  }
};

// Mission-map geometry for a scored (unsaved) load: deadhead (truckNow→pickup)
// and loaded (pickup→delivery). The Scorer supplies its own miles. Non-fatal.
export const getScoreRoute = async (body: {
  truckNow?: Place | null;
  pickup: Place;
  delivery: Place;
}): Promise<RouteGeo> => {
  try {
    const res = await api.post("/routing/route", body);
    return {
      pickup: res.data.pickup ?? null,
      delivery: res.data.delivery ?? null,
      deadhead: res.data.deadhead ?? null,
      loadedMiles: null,
    };
  } catch {
    return EMPTY_ROUTE;
  }
};
