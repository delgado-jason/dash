// What your typed numbers are actually worth.
//
// Phase 1 of "Does the forecast hold?" (Nod Sheet 2026-11-09). Jason asked
// whether dash could measure its forecasts against what landed. The recon
// narrowed it: the board ALREADY learns everywhere it has a feed — deposits
// prefer the real statement, fuel runs on the last four running weeks,
// deductions come off the last twelve statements, advances prefer the
// statement's own figure.
//
// What never learns is the four numbers he typed once into Assumptions. So
// this is the sharper feature: tell him which typed numbers have gone stale,
// and by how much, from data already on the server. No migration, works the
// day it ships.
//
// IT DOES NOT APPLY ANYTHING. The panel shows the gap and offers the swap; he
// presses it or he does not. A typed number chosen on purpose — a payroll he
// is about to change, a revenue figure he is deliberately conservative about —
// is not an error, and software that quietly overwrites judgement is worse
// than software that never asks.
import type { SettlementSummary } from "@/types/settlement";

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number): number => Math.round(n * 100) / 100;

export type AssumptionKey =
  | "weekly_revenue"
  | "weekly_fuel_advance"
  | "weekly_settlement_deductions"
  | "weekly_payroll";

export type Verdict =
  /** The typed figure is load-bearing and materially off — offer the swap. */
  | "use"
  /** Measured and close enough, or the board already measures it itself. */
  | "close"
  /** Nothing in dash feeds this one. It stays typed, and that is honest. */
  | "no-feed";

export interface AssumptionRow {
  key: AssumptionKey;
  label: string;
  basis: string;
  typed: number | null;
  measured: number | null;
  samples: number;
  lo: number | null;
  hi: number | null;
  /** Something about the spread worth saying beside the range. */
  note: string | null;
  verdict: Verdict;
}

// A gap is worth acting on when it is BOTH a real fraction of the number and
// real money. Five percent alone would shout about the deductions row, where
// $362 against $382 is twenty dollars a week — true, measured, and not worth
// a decision. Fifty dollars alone would miss a small number that is badly
// wrong. Both, or neither.
const MATERIAL_PCT = 0.05;
const MATERIAL_ABS = 50;

const material = (typed: number | null, measured: number | null): boolean => {
  if (typed == null || measured == null || typed === 0) return false;
  const gap = Math.abs(measured - typed);
  return gap >= MATERIAL_ABS && gap / Math.abs(typed) >= MATERIAL_PCT;
};

export interface AssumptionInput {
  settlements: SettlementSummary[];
  weeklyRevenue: number | null;
  weeklyFuelAdvance: number | null;
  weeklyDeductions: number | null;
  weeklyPayroll: number | null;
  /** How many statements back to measure over. Twelve is a season. */
  window?: number;
}

export const assumptionCheck = (input: AssumptionInput): AssumptionRow[] => {
  const window = input.window ?? 12;
  const recent = [...input.settlements]
    .sort((a, b) => (String(a.period_ending) < String(b.period_ending) ? 1 : -1))
    .slice(0, window);

  const n = recent.length;
  const mean = (xs: number[]): number | null =>
    xs.length === 0 ? null : round2(xs.reduce((s, x) => s + x, 0) / xs.length);

  const revenues = recent.map((s) => num(s.revenue));
  const advances = recent.map((s) => num(s.advances));
  // The advance is measured over the weeks that actually DREW one. A week at
  // home draws nothing, and averaging those zeroes in would describe how often
  // he was home rather than what he draws when he goes.
  const drawn = advances.filter((a) => a > 0);
  const dedExAdv = recent.map((s) => num(s.deductions) - num(s.advances));

  const span = (xs: number[]): { lo: number | null; hi: number | null } =>
    xs.length === 0 ? { lo: null, hi: null } : { lo: round2(Math.min(...xs)), hi: round2(Math.max(...xs)) };

  const noDraw = advances.length - drawn.length;
  const revMeasured = mean(revenues);
  const advMeasured = mean(drawn);
  const dedMeasured = mean(dedExAdv);

  return [
    {
      key: "weekly_revenue",
      label: "Weekly revenue",
      basis: "pre-holdback net",
      typed: input.weeklyRevenue,
      measured: revMeasured,
      samples: n,
      ...span(revenues),
      note: null,
      verdict: n === 0 ? "no-feed" : material(input.weeklyRevenue, revMeasured) ? "use" : "close",
    },
    {
      key: "weekly_fuel_advance",
      label: "Weekly fuel advance",
      basis: "CARD PRE-TRIP · measured over the weeks that drew",
      typed: input.weeklyFuelAdvance,
      measured: advMeasured,
      samples: drawn.length,
      ...span(advances),
      note: noDraw > 0 ? `${noDraw} ${noDraw === 1 ? "week" : "weeks"} drew nothing` : null,
      verdict:
        drawn.length === 0 ? "no-feed" : material(input.weeklyFuelAdvance, advMeasured) ? "use" : "close",
    },
    {
      key: "weekly_settlement_deductions",
      label: "Weekly deductions",
      basis: "ex-advances",
      typed: input.weeklyDeductions,
      measured: dedMeasured,
      samples: n,
      ...span(dedExAdv),
      // The board already buckets deductions off the statements; the typed
      // figure is only the fallback for a week with no statement at all.
      note: "the board already measures this one — typed is the fallback",
      verdict: n === 0 ? "no-feed" : material(input.weeklyDeductions, dedMeasured) ? "use" : "close",
    },
    {
      key: "weekly_payroll",
      label: "Weekly payroll",
      basis: "what you pay yourself",
      typed: input.weeklyPayroll,
      measured: null,
      samples: 0,
      lo: null,
      hi: null,
      note: "no feed in dash — stays typed, and that is honest",
      verdict: "no-feed",
    },
  ];
};

/** How far off a typed figure runs, as a signed fraction. Null when unmeasured. */
export const drift = (row: AssumptionRow): number | null =>
  row.typed == null || row.measured == null || row.typed === 0
    ? null
    : (row.measured - row.typed) / row.typed;
