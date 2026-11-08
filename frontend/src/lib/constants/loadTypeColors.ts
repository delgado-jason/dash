// One load-type palette, app-wide (Jason, 2026-08-10: hazmat was too close to
// standard's amber — and the colors must mean the same thing everywhere).
// Hues are drawn from the CVD-validated cat ramp: amber / blue / violet / slate.
const LOAD_TYPE_COLORS: Record<string, string> = {
  "standard flatbed": "var(--color-amber-hi)",
  oversize: "var(--color-chart-blue)",
  hazmat: "var(--color-cat3)",
  "heavy haul": "var(--color-dim)",
};

const FALLBACK = ["var(--color-cat2)", "var(--color-cat4)", "var(--color-cat6)"]; // teal / rose / olive

export const loadTypeColor = (type: string, i = 0): string =>
  LOAD_TYPE_COLORS[type] ?? FALLBACK[i % FALLBACK.length];
