import api from "./api";

export interface Place {
  city: string;
  state: string;
}

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
    };
  } catch {
    return { loadedMiles: null, deadheadMiles: null };
  }
};

// The mission map (base64 PNG data URI) for a saved load — its haul plus the
// deadhead leg chained from where the truck sat before it. null → show the text
// route. Non-fatal.
export const getLoadMap = async (loadId: string): Promise<string | null> => {
  try {
    const res = await api.get(`/routing/load-map/${loadId}`);
    return res.data.image ?? null;
  } catch {
    return null;
  }
};

// The mission map for a scored (unsaved) load: deadhead (truckNow→pickup) +
// loaded (pickup→delivery). null → no map. Non-fatal.
export const getRouteMap = async (body: {
  truckNow?: Place | null;
  pickup: Place;
  delivery: Place;
}): Promise<string | null> => {
  try {
    const res = await api.post("/routing/map", body);
    return res.data.image ?? null;
  } catch {
    return null;
  }
};
