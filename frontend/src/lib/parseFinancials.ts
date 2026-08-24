// The PASTE MONTHS parser — turns rows copied out of Jason's QBO worksheet
// into monthly_financials rows, with a per-row reconciliation check so a
// fat-fingered cell can't slip into the permanent archive. Pure; the popup
// previews the result and only commits rows when every one checks out.
import type { MonthlyFinancialRow } from "@/services/cashflowService";

export const FINANCIAL_COLUMNS = [
  "month",
  "total_income",
  "total_cogs",
  "total_opex",
  "interest_expense",
  "net_income",
  "beginning_cash",
  "operating_adjustments",
  "investing",
  "financing",
  "ending_cash",
  "accounts_receivable",
  "total_liabilities",
  "total_equity",
  "depreciation",
] as const;

export interface ParsedFinancialRow {
  row: MonthlyFinancialRow | null;
  raw: string;
  error: string | null; // parse problem OR reconciliation failure
}

const MONEY = /^-?\$?-?[\d,]*\.?\d+$/;
const cleanNum = (s: string): number | null => {
  const t = s.replace(/[$,()]/g, (c) => (c === "(" ? "-" : c === ")" ? "" : ""));
  if (!MONEY.test(s.replace(/[()]/g, "")) && !/^-?[\d.,$]+$/.test(t)) return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

// "2026-07", "2026-07-01", "7/2026", "07/2026" → "2026-07-01".
const parseMonth = (s: string): string | null => {
  let m = s.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (m) {
    const mo = Number(m[2]);
    if (mo >= 1 && mo <= 12) return `${m[1]}-${String(mo).padStart(2, "0")}-01`;
  }
  m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mo = Number(m[1]);
    if (mo >= 1 && mo <= 12) return `${m[2]}-${String(mo).padStart(2, "0")}-01`;
  }
  return null;
};

export const parseFinancialRows = (text: string): ParsedFinancialRow[] => {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const seen = new Set<string>();
  const rows = lines
    .map((raw): ParsedFinancialRow | null => {
      // Tabs first (spreadsheet paste), else commas. Never split on spaces —
      // a stray "Truck note" style cell would shred.
      const cells = (raw.includes("\t") ? raw.split("\t") : raw.split(","))
        .map((c) => c.trim());
      // A header row (starts with a non-date word like "month") is skipped.
      if (cells[0] && parseMonth(cells[0]) == null && !/^\d/.test(cells[0])) return null;

      if (cells.length !== FINANCIAL_COLUMNS.length)
        return { row: null, raw, error: `${cells.length} columns — need ${FINANCIAL_COLUMNS.length}` };

      const month = parseMonth(cells[0]);
      if (!month) return { row: null, raw, error: `bad month "${cells[0]}"` };

      const nums: number[] = [];
      for (let i = 1; i < cells.length; i++) {
        const n = cleanNum(cells[i]);
        if (n == null)
          return { row: null, raw, error: `bad number "${cells[i]}" (${FINANCIAL_COLUMNS[i]})` };
        nums.push(n);
      }
      const [inc, cogs, opex, intr, ni, beg, opadj, inv, fin, endc, ar, liab, eq, dep] = nums;

      // The same reconciliation his worksheet's Check column runs:
      // ending = beginning + (net income + adjustments + investing + financing).
      const change = ni + opadj + inv + fin;
      if (Math.abs(beg + change - endc) > 0.05)
        return {
          row: null, raw,
          error: `doesn't reconcile: ${beg.toFixed(2)} + ${change.toFixed(2)} ≠ ${endc.toFixed(2)}`,
        };

      // The same month twice in one paste would silently last-write-win in
      // the upsert — with possibly DIFFERENT numbers. Flag it instead.
      if (seen.has(month))
        return { row: null, raw, error: `duplicate month ${month.slice(0, 7)} in this paste` };
      seen.add(month);

      const s = (n: number) => n.toFixed(2);
      return {
        raw, error: null,
        row: {
          month,
          total_income: s(inc), total_cogs: s(cogs), total_opex: s(opex),
          interest_expense: s(intr), net_income: s(ni), beginning_cash: s(beg),
          operating_adjustments: s(opadj), investing: s(inv), financing: s(fin),
          ending_cash: s(endc), accounts_receivable: s(ar),
          total_liabilities: s(liab), total_equity: s(eq), depreciation: s(dep),
        },
      };
    })
    .filter((r): r is ParsedFinancialRow => r !== null);
  return rows;
};
