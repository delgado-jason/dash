// Small statistics helpers shared across the metrics. Kept separate so they're
// easy to unit-test and reuse.

// Median of a numeric list — robust to outliers, where a mean would be dragged
// by one extreme value. Returns null for an empty list. Copies before sorting,
// so the caller's array is left untouched.
export const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
