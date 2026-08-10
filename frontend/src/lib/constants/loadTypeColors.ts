// One load-type palette, app-wide (Jason, 2026-08-10: hazmat was too close to
// standard's amber — and the colors must mean the same thing everywhere).
// Hues are drawn from the CVD-validated cat ramp: amber / blue / violet / slate.
const LOAD_TYPE_COLORS: Record<string, string> = {
  "standard flatbed": "#f5b03a",
  oversize: "#4f8cd6",
  hazmat: "#8f7ad0",
  "heavy haul": "#8494ab",
};

const FALLBACK = ["#35a08c", "#c65f7d", "#8a8f28"]; // teal / rose / olive

export const loadTypeColor = (type: string, i = 0): string =>
  LOAD_TYPE_COLORS[type] ?? FALLBACK[i % FALLBACK.length];
