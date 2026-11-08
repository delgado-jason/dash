// The ONE definition of a load's net revenue (and the trailer's share of it).
//
// Rules (NET-01 / NET-02 / NET-04 / NET-05):
//   split   = the settlement_splits row in force on the load's day — the latest
//             effective_from on or before its delivery date (its pickup date for
//             a load not yet delivered; today for one with neither). Q10, Jason
//             2026-11-05: the January loads settle on the pre-trailer row.
//   net     = linehaul x (linehaul_pct + trailer_pct)
//           + fuel_surcharge x fuel_surcharge_pct
//           + sum(accessorial.amount x its per-type pay rate, else accessorial_pct)
//             over the accessorials that are NOT pass-throughs
//   trailer = linehaul x trailer_pct
//           + trailer_pct x sum(non-pass-through accessorial.amount paid at linehaul_pct + trailer_pct)
//   reimbursements = sum(pass-through accessorial.amount x its pay rate) — money
//             handed back for a cost he paid (tolls). Q8, Jason 2026-11-05: it
//             reaches him in full but is not revenue: out of gross, the rate per
//             mile, the booking stats and the earned net; still in what the
//             statement pays (the deposit, the settlement verification).
//   all rounded to 2dp (Postgres ROUND on numeric: half away from zero).
//
// REQUIRED ALIASES in any query that interpolates these fragments:
//   l   the loads row           (columns: l.load_id, l.user_id, l.linehaul, l.fuel_surcharge,
//                                l.delivery_date, l.pickup_date)
//   ss  the split in force, joined with SPLIT_JOIN_SQL (a LEFT JOIN LATERAL — its
//       columns are NULL for a load no split covers, so net/trailer come back NULL;
//       loadServices refuses the read first (requireSplitCoverage, NET-07) so a
//       load is never priced at 100%).
// The fragments introduce their own aliases `a` (accessorials) and `apr`
// (accessorial_pay_rates); do not reuse those names in the outer query's FROM.
//
// No user input ever enters these strings. They are constants.
//
// The JS mirror below (netRevenueOf / trailerNetOf / reimbursementsOf) must move
// in lockstep with the SQL; the contract test pins the whitespace-normalised SQL
// text so editing one without the other fails. Run
// backend/scripts/check-net-parity.mjs against a prod dump after any change here
// or to the pay rates or the splits.

import { ValidationError } from "../../utils/error.js";

// The split in force on the load's day (NET-01). LEFT LATERAL: a load before
// the first split gets NULLs, which loadServices refuses before this runs.
export const SPLIT_JOIN_SQL = `LEFT JOIN LATERAL (
              SELECT s.linehaul_pct, s.trailer_pct, s.fuel_surcharge_pct,
                     s.accessorial_pct, s.effective_from
                FROM settlement_splits s
               WHERE s.user_id = l.user_id
                 AND s.effective_from <= COALESCE(l.delivery_date, l.pickup_date, CURRENT_DATE)
               ORDER BY s.effective_from DESC
               LIMIT 1
            ) AS ss ON TRUE`;

export const NET_REVENUE_SQL = `ROUND(
              l.linehaul * (ss.linehaul_pct + ss.trailer_pct)
              + l.fuel_surcharge * ss.fuel_surcharge_pct
              + (SELECT COALESCE(SUM(
                     a.amount * COALESCE(apr.pay_pct, ss.accessorial_pct)
                   ), 0)
                 FROM accessorials a
                 LEFT JOIN accessorial_pay_rates apr
                   ON apr.user_id = l.user_id
                   AND apr.accessorial_type = a.accessorial_type
                 WHERE a.load_id = l.load_id
                   AND NOT COALESCE(apr.pass_through, FALSE))
            , 2)`;

// What the statement hands back for costs he paid (NET-02): the pass-through
// accessorials at their pay rate. Not revenue; cash.
export const REIMBURSEMENTS_SQL = `ROUND(
              (SELECT COALESCE(SUM(a.amount * apr.pay_pct), 0)
                 FROM accessorials a
                 JOIN accessorial_pay_rates apr
                   ON apr.user_id = l.user_id
                   AND apr.accessorial_type = a.accessorial_type
                   AND apr.pass_through
                 WHERE a.load_id = l.load_id)
            , 2)`;

// The accessorials that are revenue — every one that is not a pass-through.
// gross_revenue and total_accessorials read this (NET-02).
export const GROSS_ACCESSORIALS_SQL = `(SELECT COALESCE(SUM(a.amount), 0)
                 FROM accessorials a
                 LEFT JOIN accessorial_pay_rates apr
                   ON apr.user_id = l.user_id
                   AND apr.accessorial_type = a.accessorial_type
                 WHERE a.load_id = l.load_id
                   AND NOT COALESCE(apr.pass_through, FALSE))`;

// The trailer's cut: its % of linehaul plus its % of the base-rate
// accessorials it rides on (those paid at linehaul_pct + trailer_pct).
// FSC and flat-100% accessorials belong to the tractor, not the trailer.
export const TRAILER_NET_SQL = `ROUND(
              l.linehaul * ss.trailer_pct
              + ss.trailer_pct * (
                  SELECT COALESCE(SUM(a.amount), 0)
                  FROM accessorials a
                  LEFT JOIN accessorial_pay_rates apr
                    ON apr.user_id = l.user_id
                    AND apr.accessorial_type = a.accessorial_type
                  WHERE a.load_id = l.load_id
                    AND NOT COALESCE(apr.pass_through, FALSE)
                    AND COALESCE(apr.pay_pct, ss.accessorial_pct)
                        = ss.linehaul_pct + ss.trailer_pct)
            , 2)`;

// ---- NET-07: no schedule row is refused, not priced at 100% ----
export const NO_SCHEDULE_MESSAGE =
  "no settlement schedule — set it in Settings";

// `row` is whatever the existence lookup returned (undefined when no row).
export function assertScheduleRow(row) {
  if (!row) throw new ValidationError(NO_SCHEDULE_MESSAGE);
  return row;
}

// ---- NET-07 for the dated split (NET-01): a load no split covers is refused ----
// `uncovered` is the earliest such load {load_number, day "YYYY-MM-DD"} or
// undefined when every load has a split in force on its day.
const longDay = (ymd) =>
  new Date(`${String(ymd).slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
export const noSplitMessage = (uncovered) =>
  `load ${uncovered.load_number} (${longDay(uncovered.day)}) is before your first settlement split — add a split from that day in Settings`;
export function assertSplitCoverage(uncovered) {
  if (uncovered) throw new ValidationError(noSplitMessage(uncovered));
}

// ---- JS mirror ----
// Exact decimal arithmetic (BigInt, 1e6 scale on rates, 1e2 on money) so the
// 2dp rounding agrees with Postgres numeric ROUND, which floats would not at a
// half-cent. Rates are read to 6 decimal places.
const RATE_SCALE = 1_000_000n; // 1e6
const MONEY_SCALE = 100n; // 1e2

const isNil = (v) => v === null || v === undefined || v === "";

function scaled(v, scale) {
  const digits = scale === RATE_SCALE ? 6 : 2;
  const s = Number(v).toFixed(digits); // "-12.340000"
  const neg = s.startsWith("-");
  const [i, f] = (neg ? s.slice(1) : s).split(".");
  const n = BigInt(i + f);
  return neg ? -n : n;
}

// Round `value` (scale 1e8 = money x rate) to cents, half away from zero.
function toCents(value) {
  const div = RATE_SCALE; // 1e8 -> 1e2
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const q = (abs * 2n + div) / (div * 2n); // floor((abs + div/2) / div)
  return Number(neg ? -q : q) / 100;
}

// payRates: a plain object { Type: pct } (or { Type: {pay_pct, pass_through} }),
// a Map, or rows [{accessorial_type, pay_pct, pass_through}]. Each entry becomes
// { pct, pass }: pass is the NET-02 pass-through flag (false when absent).
function rateLookup(payRates) {
  const m = new Map();
  const entry = (v) =>
    v && typeof v === "object" && !(v instanceof Date)
      ? { pct: v.pay_pct, pass: v.pass_through === true }
      : { pct: v, pass: false };
  if (payRates instanceof Map) {
    for (const [k, v] of payRates) m.set(k, entry(v));
  } else if (Array.isArray(payRates)) {
    for (const r of payRates) m.set(r.accessorial_type, { pct: r.pay_pct, pass: r.pass_through === true });
  } else if (payRates && typeof payRates === "object") {
    for (const [k, v] of Object.entries(payRates)) m.set(k, entry(v));
  }
  return m;
}

const isPassThrough = (type, rates) => rates.get(type)?.pass === true;

// The pay rate for one accessorial: its row's pay_pct when a row exists (a
// 0% row keeps $0 — High Value-EVC), else the split's accessorial_pct.
// A null pay_pct is "no row" (COALESCE). Returns a scaled BigInt or null.
function effectivePct(type, rates, split) {
  const row = rates.get(type);
  if (row && !isNil(row.pct)) return scaled(row.pct, RATE_SCALE);
  if (isNil(split.accessorial_pct)) return null;
  return scaled(split.accessorial_pct, RATE_SCALE);
}

// Mirrors NET_REVENUE_SQL. Like the SQL: a null linehaul / fuel_surcharge /
// linehaul_pct / trailer_pct / fuel_surcharge_pct makes the whole result null
// (columns are NOT NULL in the database, so this is unreachable on real rows);
// a null accessorial amount (or a null effective rate) adds nothing, as SUM does.
export function netRevenueOf(
  { linehaul, fuel_surcharge, accessorials },
  split,
  payRates,
) {
  if (
    isNil(linehaul) ||
    isNil(fuel_surcharge) ||
    isNil(split?.linehaul_pct) ||
    isNil(split?.trailer_pct) ||
    isNil(split?.fuel_surcharge_pct)
  ) {
    return null;
  }
  const rates = rateLookup(payRates);
  let total =
    scaled(linehaul, MONEY_SCALE) *
      (scaled(split.linehaul_pct, RATE_SCALE) +
        scaled(split.trailer_pct, RATE_SCALE)) +
    scaled(fuel_surcharge, MONEY_SCALE) *
      scaled(split.fuel_surcharge_pct, RATE_SCALE);
  for (const a of accessorials ?? []) {
    if (isNil(a?.amount)) continue;
    const type = a.accessorial_type ?? a.type;
    if (isPassThrough(type, rates)) continue; // NET-02: a reimbursement is not revenue
    const pct = effectivePct(type, rates, split);
    if (pct === null) continue;
    total += scaled(a.amount, MONEY_SCALE) * pct;
  }
  return toCents(total);
}

// Mirrors REIMBURSEMENTS_SQL: the pass-through accessorials at their pay rate.
export function reimbursementsOf({ accessorials }, payRates) {
  const rates = rateLookup(payRates);
  let total = 0n;
  for (const a of accessorials ?? []) {
    if (isNil(a?.amount)) continue;
    const row = rates.get(a.accessorial_type ?? a.type);
    if (!row || row.pass !== true || isNil(row.pct)) continue;
    total += scaled(a.amount, MONEY_SCALE) * scaled(row.pct, RATE_SCALE);
  }
  return toCents(total);
}

// Mirrors TRAILER_NET_SQL: the trailer's % of linehaul plus its % of the
// accessorials whose effective rate equals linehaul_pct + trailer_pct.
export function trailerNetOf({ linehaul, accessorials }, split, payRates) {
  if (
    isNil(linehaul) ||
    isNil(split?.linehaul_pct) ||
    isNil(split?.trailer_pct)
  ) {
    return null;
  }
  const rates = rateLookup(payRates);
  const trailerPct = scaled(split.trailer_pct, RATE_SCALE);
  const lhRate = scaled(split.linehaul_pct, RATE_SCALE) + trailerPct;
  let base = 0n; // money scale
  for (const a of accessorials ?? []) {
    if (isNil(a?.amount)) continue;
    const type = a.accessorial_type ?? a.type;
    if (isPassThrough(type, rates)) continue; // NET-02
    const pct = effectivePct(type, rates, split);
    if (pct !== null && pct === lhRate) base += scaled(a.amount, MONEY_SCALE);
  }
  return toCents(
    scaled(linehaul, MONEY_SCALE) * trailerPct + trailerPct * base,
  );
}
