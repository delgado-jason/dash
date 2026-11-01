import api from "./api";

export interface FreightIndexPoint {
  month: string; // 'YYYY-MM'
  value: number; // FRED PPI index (Dec-2003 = 100)
}

// Macro freight-rate barometer (FRED PPI: Specialized Freight Trucking,
// Long-Distance), proxied + cached by the backend. Degrades to [] so the Market
// page's barometer just shows the owner's own line when FRED is unconfigured/down.
export const getFreightIndex = async (): Promise<FreightIndexPoint[]> => {
  try {
    const res = await api.get("/freight-index");
    return (res.data.series ?? []).map(
      (s: { month: string; value: number }) => ({
        month: s.month,
        value: Number(s.value),
      }),
    );
  } catch {
    return [];
  }
};

export interface FreightSignals {
  index: FreightIndexPoint[];
  diesel: FreightIndexPoint[]; // U.S. diesel, monthly averages ($/gal) — may be empty
}

// The index AND diesel, so the market signal can tell a fuel move from a rate
// move. Degrades to empty series like getFreightIndex.
export const getFreightSignals = async (): Promise<FreightSignals> => {
  try {
    const res = await api.get("/freight-index");
    const pts = (xs: unknown): FreightIndexPoint[] =>
      (Array.isArray(xs) ? xs : []).map((s) => {
        const p = s as { month: string; value: number };
        return { month: p.month, value: Number(p.value) };
      });
    return { index: pts(res.data.series), diesel: pts(res.data.diesel) };
  } catch {
    return { index: [], diesel: [] };
  }
};
