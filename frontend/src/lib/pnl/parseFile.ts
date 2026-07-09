import Papa from "papaparse";
import { parsePnlRows, classifyExpenses } from "./parsePnl";
import type { ExpenseType } from "@/types/expense";

export interface ProposedLine {
  category: string;
  amount: number;
  type: ExpenseType;
  section: "cogs" | "expenses";
}

export interface ProposedPeriod {
  period_month: string | null;
  period_label: string | null;
  income_total: number | null;
  cogs_total: number | null;
  expense_total: number | null;
  lines: ProposedLine[];
}

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

// "Jun 2026" → "2026-06-01" (period_month is the first of the month)
export const labelToMonth = (label: string | null): string | null => {
  if (!label) return null;
  const m = label.match(/([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const idx = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
  if (idx < 0) return null;
  return `${m[2]}-${String(idx + 1).padStart(2, "0")}-01`;
};

// On Jason's P&L the COGS group is labeled "Cost of goods sold" but it's fuel —
// show it as "Fuel" for clarity.
const displayName = (name: string, section: "cogs" | "expenses"): string =>
  section === "cogs" && name.trim().toLowerCase() === "cost of goods sold"
    ? "Fuel"
    : name;

// Parse an uploaded P&L CSV into a proposed period. Classification: remembered
// per-category defaults win; otherwise the keyword/two-month proposal.
export const parsePnlFile = (
  file: File,
  defaults: Record<string, ExpenseType>,
): Promise<ProposedPeriod> =>
  new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      complete: (result) => {
        try {
          const parsed = parsePnlRows(result.data);
          const lines: ProposedLine[] = classifyExpenses(parsed.lines).map(
            (l) => {
              const category = displayName(l.name, l.section);
              return {
                category,
                amount: l.current,
                type: defaults[category] ?? l.type,
                section: l.section,
              };
            },
          );
          resolve({
            period_month: labelToMonth(parsed.currentLabel),
            period_label: parsed.currentLabel,
            income_total: parsed.incomeTotal,
            cogs_total: parsed.cogsTotal,
            expense_total: parsed.expenseTotal,
            lines,
          });
        } catch (err) {
          reject(err);
        }
      },
      error: reject,
    });
  });
