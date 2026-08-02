// QuickBooks Profit & Loss CSV parser. Operates on already-split rows
// (string[][]) so the logic is pure and testable; a thin papaparse wrapper
// feeds it the uploaded file at runtime.
//
// QuickBooks nests categories: a parent (which may itself carry a direct
// amount) → child rows → a "Total for <parent>" subtotal, and sections nest the
// same way. We collapse each group to its TOP-LEVEL "Total for" (or a standalone
// row) so a category is counted exactly once — never a parent + its children,
// never a nested subtotal + its section total.

export interface ParsedLine {
  name: string;
  current: number; // current month
  prior: number | null; // prior month — drives the fixed/variable heuristic
  section: "cogs" | "expenses";
}

export interface ParsedPnl {
  currentLabel: string | null;
  priorLabel: string | null;
  incomeTotal: number | null;
  cogsTotal: number | null;
  expenseTotal: number | null;
  lines: ParsedLine[];
}

const SECTIONS = ["Income", "Cost of Goods Sold", "Expenses", "Other Income"];

// Month name (abbrev or full) + 4-digit year, e.g. "Jul 2026" / "July 2026".
// Used to recover the period from the title block of single-period exports —
// QuickBooks omits the ",Jul 2026,Jun 2026 (PP)" column header and instead puts
// "July 2026" in the title's first cell. Won't match "August 02, 2026" (the
// export-timestamp footer): a day number sits between the month and the year.
const MONTH_YEAR_RE =
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}\b/i;

// "$2,547.70" → 2547.7 · "-10,936.24" → -10936.24 · "" → null
export const cleanNum = (raw: string | undefined): number | null => {
  if (raw == null) return null;
  const s = raw.replace(/[$,"\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
};

const totalForName = (name: string): string | null =>
  name.startsWith("Total for ") ? name.slice("Total for ".length) : null;

export const parsePnlRows = (rows: string[][]): ParsedPnl => {
  // Pre-scan: names that have a "Total for X" row are parent groups.
  const parents = new Set<string>();
  for (const row of rows) {
    const x = totalForName((row[0] ?? "").trim());
    if (x) parents.add(x);
  }

  let section: "income" | "cogs" | "expenses" | "other" | null = null;
  let depth = 0; // how many parent groups we're currently inside
  const lines: ParsedLine[] = [];
  let currentLabel: string | null = null;
  let priorLabel: string | null = null;
  let incomeTotal: number | null = null;
  let cogsTotal: number | null = null;
  let expenseTotal: number | null = null;

  for (const row of rows) {
    const name = (row[0] ?? "").trim();
    const cur = cleanNum(row[1]);
    const pri = cleanNum(row[2]);

    // Column header, e.g. ",Jun 2026,May 2026 (PP)" (blank first cell)
    if (!currentLabel && !name && /\b\d{4}\b/.test(row[1] ?? "")) {
      currentLabel = (row[1] ?? "").trim();
      priorLabel = (row[2] ?? "").replace(/\(PP\)/, "").trim();
      continue;
    }
    if (!name) continue;

    const totalOf = totalForName(name);

    // Section total ("Total for Expenses" etc.): capture, close the section.
    if (totalOf && SECTIONS.includes(totalOf)) {
      if (totalOf === "Income") incomeTotal = cur;
      else if (totalOf === "Cost of Goods Sold") cogsTotal = cur;
      else if (totalOf === "Expenses") expenseTotal = cur;
      section = null;
      depth = 0;
      continue;
    }

    // Section header.
    if (SECTIONS.includes(name)) {
      section =
        name === "Cost of Goods Sold"
          ? "cogs"
          : name === "Expenses"
            ? "expenses"
            : name === "Income"
              ? "income"
              : "other";
      depth = 0;
      continue;
    }

    const inCost = section === "cogs" || section === "expenses";
    const sectionKey: "cogs" | "expenses" = section === "cogs" ? "cogs" : "expenses";

    if (totalOf) {
      // A category subtotal closing a group. Emit only at the top level.
      depth = Math.max(0, depth - 1);
      if (inCost && depth === 0) {
        lines.push({ name: totalOf, current: cur ?? 0, prior: pri, section: sectionKey });
      }
      continue;
    }

    if (parents.has(name)) {
      // Parent group opening — its direct amount is in the "Total for" row.
      depth += 1;
      continue;
    }

    // Standalone leaf: only a top-level (depth 0) row with an amount counts.
    if (inCost && depth === 0 && cur != null) {
      lines.push({ name, current: cur, prior: pri, section: sectionKey });
    }
  }

  // Single-period exports (no comparison column) omit the "…,Jul 2026,…" header
  // and instead label the period only in the title block ("July 2026", first
  // cell). If the header scan above found nothing, recover it from the rows
  // above the first section — scoped there so the export-timestamp footer can
  // never win.
  if (!currentLabel) {
    const firstSection = rows.findIndex((r) =>
      SECTIONS.includes((r[0] ?? "").trim()),
    );
    const end = firstSection < 0 ? rows.length : firstSection;
    for (let i = 0; i < end && !currentLabel; i++) {
      for (const cell of rows[i]) {
        if (MONTH_YEAR_RE.test((cell ?? "").trim())) {
          currentLabel = (cell ?? "").trim();
          break;
        }
      }
    }
  }

  return { currentLabel, priorLabel, incomeTotal, cogsTotal, expenseTotal, lines };
};

// ---- fixed / variable classification ----
export type ExpenseType = "fixed" | "variable";
export interface ClassifiedLine extends ParsedLine {
  type: ExpenseType;
}

const FIXED_KEYWORDS = [
  "insurance",
  "permit",
  "max weight",
  "eobr",
  "warranty",
  "internet",
  "health",
  "lcn",
];
const VARIABLE_KEYWORDS = [
  "fuel",
  "repair",
  "maintenance",
  "parts",
  "toll",
  "prepass",
  "supplies",
  "tax",
  "scale",
];

// Proposal only — the confirm step + editable ledger let Jason override.
export const classifyExpenses = (lines: ParsedLine[]): ClassifiedLine[] =>
  lines.map((line) => {
    let type: ExpenseType;
    if (line.prior != null && line.current === line.prior) {
      type = "fixed"; // unchanged month-to-month → fixed
    } else {
      const lower = line.name.toLowerCase();
      if (VARIABLE_KEYWORDS.some((k) => lower.includes(k))) type = "variable";
      else if (FIXED_KEYWORDS.some((k) => lower.includes(k))) type = "fixed";
      else type = "variable"; // unknown mover → variable
    }
    return { ...line, type };
  });
