// OPEN ISSUES (the Maintenance sheet, call 6) — the small helpers the panel
// and the log sheet share. Pure.
import type { MaintenanceIssue, IssueSeverity } from "@/types/maintenance";

export const SEVERITIES: ReadonlyArray<{ value: IssueSeverity; label: string; word: string }> = [
  { value: "watch", label: "Watch", word: "keep an eye on it" },
  { value: "soon", label: "Soon", word: "next shop stop" },
  { value: "now", label: "Now", word: "before the next load" },
];

const RANK: Record<IssueSeverity, number> = { now: 0, soon: 1, watch: 2 };

// Open issues first, the most urgent on top, the oldest of a severity first.
export const sortIssues = (issues: MaintenanceIssue[]): MaintenanceIssue[] =>
  [...issues].sort(
    (a, b) =>
      Number(a.status === "closed") - Number(b.status === "closed") ||
      RANK[a.severity] - RANK[b.severity] ||
      a.noticed_on.localeCompare(b.noticed_on),
  );

export const openIssues = (issues: MaintenanceIssue[]): MaintenanceIssue[] =>
  sortIssues(issues.filter((i) => i.status === "open"));

// Days an open issue has been open, on the operator's own day keys.
export const daysOpen = (issue: MaintenanceIssue, todayKey: string): number => {
  const a = Date.parse(`${issue.noticed_on}T00:00:00Z`);
  const b = Date.parse(`${todayKey}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86_400_000));
};
