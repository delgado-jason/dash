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
