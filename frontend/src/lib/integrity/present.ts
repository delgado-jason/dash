// How the Integrity page words what the checks found (Nod Sheet "The Protection
// Stage", mock 1): the two groups, the header's count words, the day a gap began
// and the "Clean" footer — what passed, computed from the same inputs the checks
// read. Pure; the page only lays these out.
import { isDelivered } from "@/lib/metrics/status";
import { sortIssues, type Issue, type IntegrityInputs, type Severity } from "./issue";

export interface IssueGroups {
  money: Issue[];
  data: Issue[];
}

// The page's order: money first, then data, newest first within each.
export const groupIssues = (issues: Issue[]): IssueGroups => {
  const sorted = sortIssues(issues);
  return {
    money: sorted.filter((i) => i.severity === "money"),
    data: sorted.filter((i) => i.severity === "data"),
  };
};

export const countsOf = (issues: Issue[]): Record<Severity, number> => ({
  money: issues.filter((i) => i.severity === "money").length,
  data: issues.filter((i) => i.severity === "data").length,
});

// "money 3 · data 4" — a dispatcher's list holds no money rows, so the page
// passes her the words for data only.
export const countWords = (issues: Issue[]): string => {
  const c = countsOf(issues);
  return `money ${c.money} · data ${c.data}`;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// 'YYYY-MM-DD' → "Nov 4", read as text (never through a Date, so no zone shifts the day).
export const sinceWords = (since: string | null): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(since ?? "");
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[3])}` : null;
};

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

// What passed. A line appears only when EVERYTHING of its kind passes — a
// partial pass is already a row above, never a footnote. A dispatcher is told
// only about the records she enters.
export const cleanLines = (inputs: IntegrityInputs, issues: Issue[]): string[] => {
  void issues; // the lines are computed from the inputs themselves, never from what's absent in the list
  const out: string[] = [];

  const delivered = inputs.loads.filter(isDelivered);
  const withBoth = delivered.filter((l) => l.odometer_start != null && l.odometer_end != null);
  if (delivered.length > 0 && withBoth.length === delivered.length) {
    out.push(
      `${plural(delivered.length, "delivered load carries", "delivered loads carry")} both readings`,
    );
  }

  if (inputs.role === "dispatcher") return out;

  const b = inputs.basis;
  if (b && b.monthsWanted > 0 && b.months === b.monthsWanted && !b.missingLabel) {
    out.push(`${b.months} of ${b.monthsWanted} basis months filed`);
  }

  const active = inputs.obligations.filter((o) => o.active && !o.is_draw);
  if (active.length > 0 && active.every((o) => o.day_of_month != null)) {
    out.push("every active bill has its draft day");
  }

  const tracked = inputs.obligations.filter((o) => o.current_balance != null);
  if (tracked.length > 0 && tracked.every((o) => o.balance_as_of)) {
    out.push("every tracked note has a balance date");
  }

  return out;
};
