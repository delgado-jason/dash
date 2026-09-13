// THE MONTHLY REVIEW (Jason, 2026-09-04; v2 mockup approved): review MONTHLY,
// judge on the TRAILING 90 DAYS — at ~8 loads/month a single month is noise
// and the quarter is evidence. Same ~90-day doctrine as break-even, fuel
// windows, and the QBO margin. The verdicts themselves moved to
// lib/relationships/review.ts with REL-01 v2.0 (they are the re-tier
// suggestion's direction now); what stays here is the window every board on
// the Review judges on.

const DAY = 86_400_000;
const keyOf = (d: Date) => d.toISOString().slice(0, 10);

// The window: 90 days ending on the LAST DAY of the chosen month (clamped to
// `now` for the current month — no judging days that haven't happened).
export interface ReviewWindow {
  startKey: string;
  endKey: string;
  label: string; // "QUARTER ENDING AUG 31 ’26"
}

export const reviewWindow = (monthKey: string, now: Date): ReviewWindow => {
  const [y, m] = monthKey.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0)); // last day of the month
  const end = monthEnd.getTime() > now.getTime() ? now : monthEnd;
  const endKey = keyOf(end);
  const startKey = keyOf(new Date(end.getTime() - 89 * DAY));
  const label = `QUARTER ENDING ${end
    .toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .toUpperCase()} ’${String(end.getUTCFullYear()).slice(2)}`;
  return { startKey, endKey, label };
};
