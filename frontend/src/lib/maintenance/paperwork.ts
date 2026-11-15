// THE PAPERWORK the log exists to feed (the Maintenance sheet, call 8), pure:
// which compliance items are Landstar's maintenance paperwork, the rows the
// panel prints, and the calendar quarter the report covers.
import type { ComplianceItem } from "@/types/compliance";

// An inspection, a maintenance report, or anything named for Landstar —
// active, with a date to keep.
export const paperworkItems = (items: ComplianceItem[]): ComplianceItem[] =>
  items.filter((i) => {
    if (!i.active || !i.expires_on) return false;
    const cat = (i.category ?? "").toLowerCase();
    const label = i.label.toLowerCase();
    return (
      cat.includes("inspection") ||
      cat.includes("maintenance") ||
      label.includes("landstar") ||
      label.includes("maintenance report")
    );
  });

export interface PaperworkRow {
  label: string;
  scopes: string; // "truck + trailer"
  expires: string; // the earliest 'YYYY-MM-DD' across the scopes
}

// One row per label, the scopes joined, the earliest date, soonest first.
export const paperworkRows = (items: ComplianceItem[]): PaperworkRow[] => {
  const by = new Map<string, { scopes: Set<string>; expires: string }>();
  for (const i of paperworkItems(items)) {
    const expires = i.expires_on as string;
    const row = by.get(i.label) ?? { scopes: new Set<string>(), expires };
    row.scopes.add(i.scope);
    if (expires < row.expires) row.expires = expires;
    by.set(i.label, row);
  }
  return [...by.entries()]
    .map(([label, r]) => ({ label, scopes: [...r.scopes].join(" + "), expires: r.expires }))
    .sort((a, b) => a.expires.localeCompare(b.expires));
};

// This calendar quarter's months as 'YYYY-MM' from/to, and its first day.
export const quarterOf = (today: string): { from: string; to: string; start: string } => {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const q0 = Math.floor((m - 1) / 3) * 3 + 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { from: `${y}-${pad(q0)}`, to: `${y}-${pad(q0 + 2)}`, start: `${y}-${pad(q0)}-01` };
};

export const daysUntil = (iso: string, today: string): number =>
  Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
