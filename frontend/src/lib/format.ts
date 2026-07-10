// Format a DATE value (which the API returns as an ISO string) to just the
// date, UTC-safe — no time, no timezone.
export const formatDate = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const d = String(v).slice(0, 10); // 'YYYY-MM-DD'
  return new Date(d + "T00:00:00Z").toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
};
