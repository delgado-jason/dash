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
  // What the file didn't say and what it said twice (2026-11-01: an October
  // export in QuickBooks' newer layout — "Total Expenses", "Gross Profit",
  // "Net Operating Income" without the "for" — saved those rows as expense
  // lines and the month with no totals, which read as a free month and dropped
  // every rung). A warning is survivable (a total summed from the lines); an
  // error means the file doesn't reconcile with itself and must not be saved.
  warnings: string[];
  errors: string[];
}

const SECTIONS = ["Income", "Cost of Goods Sold", "Expenses", "Other Income", "Other Expenses"];
// Rows QuickBooks computes from the sections above them — never a category.
const COMPUTED = ["gross profit", "net operating income", "net other income", "net income", "net earnings", "net revenue"];
const norm = (s: string): string => s.trim().toLowerCase();

// Month name (abbrev or full) + 4-digit year, e.g. "Jul 2026" / "July 2026".
// Used to recover the period from the title block of single-period exports —
// QuickBooks omits the ",Jul 2026,Jun 2026 (PP)" column header and instead puts
// "July 2026" in the title's first cell. Won't match "August 02, 2026" (the
// export-timestamp footer): a day number sits between the month and the year.
const MONTH_YEAR_RE =
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}\b/i;

// "$2,547.70" → 2547.7 · "-10,936.24" → -10936.24 · "-$2,339.26" → -2339.26 · "" → null
export const cleanNum = (raw: string | undefined): number | null => {
  if (raw == null) return null;
  const s = raw.replace(/[$,"\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
};

// "Total for X" (the classic export) and "Total X" (the newer one) → X.
const totalForName = (name: string): string | null => {
  const m = name.match(/^total\s+(?:for\s+)?(.+)$/i);
  return m ? m[1].trim() : null;
};
// Exact match on purpose: QuickBooks' default account "Cost of goods sold"
// sits INSIDE the section "Cost of Goods Sold" and differs only by case.
const sectionOf = (x: string): string | null => SECTIONS.find((s) => s === x.trim()) ?? null;

const money = (n: number): string => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const parsePnlRows = (rows: string[][]): ParsedPnl => {
  // Pre-scan: names that have a "Total (for) X" row are parent groups.
  const parents = new Set<string>();
  for (const row of rows) {
    const x = totalForName((row[0] ?? "").trim());
    if (x && !sectionOf(x)) parents.add(x);
  }

  let section: "income" | "cogs" | "expenses" | "other" | null = null;
  let depth = 0; // how many parent groups we're currently inside
  const lines: ParsedLine[] = [];
  let currentLabel: string | null = null;
  let priorLabel: string | null = null;
  let incomeTotal: number | null = null;
  let cogsTotal: number | null = null;
  let expenseTotal: number | null = null;
  let incomeSum = 0; // the income section's own top-level rows, for the fallback
  let incomeRows = 0;

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

    // A computed row (Gross Profit, Net Operating Income, Net Income…) closes
    // whatever section was open and is never a line.
    if (COMPUTED.includes(norm(name))) {
      section = null;
      depth = 0;
      continue;
    }

    const totalOf = totalForName(name);
    const totalSection = totalOf ? sectionOf(totalOf) : null;

    // Section total ("Total for Expenses" / "Total Expenses"): capture, close the section.
    if (totalSection) {
      if (totalSection === "Income") incomeTotal = cur;
      else if (totalSection === "Cost of Goods Sold") cogsTotal = cur;
      else if (totalSection === "Expenses") expenseTotal = cur;
      section = null;
      depth = 0;
      continue;
    }

    // Section header.
    const header = sectionOf(name);
    if (header && cur == null) {
      section =
        header === "Cost of Goods Sold"
          ? "cogs"
          : header === "Expenses"
            ? "expenses"
            : header === "Income"
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
      if (depth === 0) {
        if (inCost) lines.push({ name: totalOf, current: cur ?? 0, prior: pri, section: sectionKey });
        else if (section === "income" && cur != null) { incomeSum += cur; incomeRows++; }
      }
      continue;
    }

    if (parents.has(name)) {
      // Parent group opening — its direct amount is in the "Total for" row.
      depth += 1;
      continue;
    }

    // Standalone leaf: only a top-level (depth 0) row with an amount counts.
    if (depth === 0 && cur != null) {
      if (inCost) lines.push({ name, current: cur, prior: pri, section: sectionKey });
      else if (section === "income") { incomeSum += cur; incomeRows++; }
    }
  }

  // Single-period exports (no comparison column) omit the "…,Jul 2026,…" header
  // and instead label the period only in the title block ("July 2026", first
  // cell). If the header scan above found nothing, recover it from the rows
  // above the first section — scoped there so the export-timestamp footer can
  // never win.
  if (!currentLabel) {
    const firstSection = rows.findIndex((r) => sectionOf((r[0] ?? "").trim()) != null);
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

  // The file against itself. A section's lines must sum to its total; a total
  // the file didn't carry is summed from the lines and said so; lines that
  // disagree with the file's own total are an error — the month is not saved.
  const warnings: string[] = [];
  const errors: string[] = [];
  const sum = (key: "cogs" | "expenses") => lines.filter((l) => l.section === key).reduce((s, l) => s + l.current, 0);
  const check = (label: string, total: number | null, lineSum: number, n: number, set: (v: number) => void) => {
    if (n === 0) return;
    if (total == null) {
      set(Math.round(lineSum * 100) / 100);
      warnings.push(`The file carried no ${label} total — summed from its ${n} line${n === 1 ? "" : "s"} (${money(lineSum)}).`);
    } else if (Math.abs(total - lineSum) > 0.011) {
      errors.push(`${label}: the lines sum to ${money(lineSum)} but the file's total is ${money(total)} — this export doesn't reconcile with itself. Re-export the P&L (one month, with its section totals) and try again.`);
    }
  };
  check("Cost of Goods Sold", cogsTotal, sum("cogs"), lines.filter((l) => l.section === "cogs").length, (v) => { cogsTotal = v; });
  check("Expenses", expenseTotal, sum("expenses"), lines.filter((l) => l.section === "expenses").length, (v) => { expenseTotal = v; });
  if (incomeTotal == null && incomeRows > 0) {
    incomeTotal = Math.round(incomeSum * 100) / 100;
    warnings.push(`The file carried no Income total — summed from its ${incomeRows} line${incomeRows === 1 ? "" : "s"} (${money(incomeSum)}).`);
  }
  if (lines.length === 0) errors.push("No cost lines found — is this a QuickBooks Profit and Loss export?");

  return { currentLabel, priorLabel, incomeTotal, cogsTotal, expenseTotal, lines, warnings, errors };
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
