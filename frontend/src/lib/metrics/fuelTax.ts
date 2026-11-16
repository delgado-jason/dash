// Landstar's fuel-tax line. A BCO does not file IFTA — Landstar does, and
// takes "<MON> FUEL TAX" on a settlement each month (on Jason's statements:
// SEP FUEL TAX $91 on the Oct 28 settlement, AUG $58, JUL $23). The Fuel
// page's gallons by state are the check against that line, not a form to
// re-enter. Pure: reads the settlement lines the cash board already imports.

export interface FuelTaxLineLike {
  description: string;
  deductions: string | number | null;
  period_ending: string; // the settlement's 'YYYY-MM-DD'
}

export interface FuelTaxMonth {
  month: string; // 'YYYY-MM' — the month the tax is FOR
  amount: number;
  settlementEnding: string; // the settlement it was taken on
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** "SEP FUEL TAX" on an Oct 28 settlement → 2026-09; "DEC FUEL TAX" on a Jan 16 settlement → the year before. */
export const fuelTaxMonth = (description: string, periodEnding: string): string | null => {
  const m = /^\s*([A-Z]{3})\s+FUEL\s+TAX\s*$/i.exec(description ?? "");
  if (!m) return null;
  const idx = MONTHS.indexOf(m[1].toUpperCase());
  if (idx < 0) return null;
  const ending = String(periodEnding).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ending)) return null;
  let year = Number(ending.slice(0, 4));
  const endingMonth = Number(ending.slice(5, 7)); // 1-based
  if (idx + 1 > endingMonth) year -= 1; // the tax for a month after the settlement's month is last year's
  return `${year}-${String(idx + 1).padStart(2, "0")}`;
};

/** The fuel-tax deductions by the month they are for, newest first. */
export const fuelTaxByMonth = (lines: FuelTaxLineLike[]): FuelTaxMonth[] => {
  const m = new Map<string, FuelTaxMonth>();
  for (const l of lines) {
    const month = fuelTaxMonth(l.description, l.period_ending);
    if (!month) continue;
    const amount = Number(l.deductions) || 0;
    const cur = m.get(month);
    if (cur) {
      cur.amount += amount;
      if (l.period_ending > cur.settlementEnding) cur.settlementEnding = String(l.period_ending).slice(0, 10);
    } else m.set(month, { month, amount, settlementEnding: String(l.period_ending).slice(0, 10) });
  }
  return [...m.values()].sort((a, b) => (a.month < b.month ? 1 : -1));
};
