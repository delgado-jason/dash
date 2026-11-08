// Small pure helpers shared by the money-write validators (protection stage 4b).
// Null is not zero: a blank or non-numeric value is NOT a number here, so a
// validator can refuse it instead of letting Number(null) = 0 through.

export const isBlank = (v) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "");

// A finite number from a number or a numeric string; null for anything else
// (blank, null, 'abc', NaN, Infinity, booleans, arrays, objects).
export const toNumber = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

// 'YYYY-MM-DD' that exists on the calendar (2026-02-30 and 2026-13-01 do not).
export const isCalendarDate = (v) => {
  if (typeof v !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
};

// "$3,284.52"
export const dollars = (n) =>
  `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// "Oct 30" from '2026-10-30'
export const monthDay = (ymd) =>
  new Date(`${String(ymd).slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const cents = (n) => Math.round(Number(n) * 100);
// Equal to within `tol` cents (default one cent — "within $0.01").
export const withinCents = (a, b, tol = 1) => Math.abs(cents(a) - cents(b)) <= tol;
