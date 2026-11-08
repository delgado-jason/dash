// Dated pay splits — the pure rules (Q10, Jason 2026-11-05; General Items mock
// 6, nodded 2026-11-07). The split in force on a day is the row with the
// latest effective_from on or before it; a day before the first row has NONE
// (the API refuses a load it cannot price — never 100%). Day keys compared as
// strings; no timezone can shift a start.
import type { SettlementSplit } from "@/types/settlementSplit";

export const sortSplits = (splits: SettlementSplit[]): SettlementSplit[] =>
  [...splits].sort((a, b) => (a.effective_from < b.effective_from ? -1 : a.effective_from > b.effective_from ? 1 : 0));

export const splitInForce = (splits: SettlementSplit[], day: string): SettlementSplit | null => {
  let best: SettlementSplit | null = null;
  for (const s of splits) {
    if (s.effective_from <= day && (best == null || s.effective_from > best.effective_from)) best = s;
  }
  return best;
};

// "Jan 1, 2026" from a day key, read in UTC so the day never shifts.
export const dayWords = (key: string): string =>
  new Date(`${key.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const pct = (f: number): string => `${Math.round(f * 1000) / 10}%`;

// "linehaul 65% · trailer 8% · fuel surcharge 100% · accessorials 73%" — the row's words.
export const splitWords = (s: Pick<SettlementSplit, "linehaul_pct" | "trailer_pct" | "fuel_surcharge_pct" | "accessorial_pct">): string =>
  `linehaul ${pct(s.linehaul_pct)} · trailer ${pct(s.trailer_pct)} · fuel surcharge ${pct(s.fuel_surcharge_pct)} · accessorials ${pct(s.accessorial_pct)}`;

// "settled on the Feb 3, 2026 schedule" — the load page's line; null when the
// API sent no split day (a load the guard would have refused).
export const settledOnWords = (effective_from: string | null | undefined): string | null =>
  effective_from ? `settled on the ${dayWords(effective_from)} schedule` : null;
