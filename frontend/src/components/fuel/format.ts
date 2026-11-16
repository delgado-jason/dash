// The Fuel page's small formatters — kept apart from the components so fast
// refresh keeps working (a component file exports components only).
export const monthLong = (ym: string, year = false): string =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
export const monthShort = (ym: string): string =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
export const pct0 = (n: number): string => `${Math.round(n * 100)}%`;

// The ink a graded word wears — one tone per meaning, every colour a token.
export const GRADE_CLASS = {
  par: "text-status-positive-text",
  close: "text-amber",
  short: "text-status-negative-text",
  unknown: "text-faint",
} as const;
