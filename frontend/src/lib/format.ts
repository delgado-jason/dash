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

// ---- Money ----
// The app's default: whole-dollar money for aggregates, totals, and per-load
// amounts shown in lists. null/undefined → "—".
export const money = (n: number | null | undefined): string =>
  n == null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`;

// Full currency WITH cents — reserved for an individual load's detail line items
// and receipt-level amounts (fuel). null/undefined → "—".
export const moneyCents = (n: number | null | undefined): string =>
  n == null
    ? "—"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD" });

// A per-mile rate ($/mi) — always two decimals. null/undefined → "—".
export const rpm = (n: number | null | undefined): string =>
  n == null ? "—" : `$${n.toFixed(2)}`;

// A diesel pump price ($/gal) — three decimals, the fuel-industry convention
// (e.g. "$3.859"). null/undefined → "—".
export const dieselPrice = (n: number | null | undefined): string =>
  n == null ? "—" : `$${n.toFixed(3)}`;
