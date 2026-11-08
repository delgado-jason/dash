// The ONE definition of a load's net revenue (and the trailer's share of it).
//
// Rules (NET-01 / NET-04 / NET-05):
//   net     = linehaul x (linehaul_pct + trailer_pct)
//           + fuel_surcharge x fuel_surcharge_pct
//           + sum(accessorial.amount x its per-type pay rate, else accessorial_pct)
//   trailer = linehaul x trailer_pct
//           + trailer_pct x sum(accessorial.amount paid at linehaul_pct + trailer_pct)
//   both rounded to 2dp (Postgres ROUND on numeric: half away from zero).
//
// REQUIRED ALIASES in any query that interpolates these fragments:
//   l   the loads row           (columns: l.load_id, l.user_id, l.linehaul, l.fuel_surcharge)
//   ss  the user's settlement_schedules row, joined with an INNER JOIN
//       (ss.linehaul_pct, ss.trailer_pct, ss.fuel_surcharge_pct, ss.accessorial_pct —
//       all NOT NULL columns, so there is no COALESCE fallback: NET-07, a user with
//       no schedule row is REFUSED by assertScheduleRow, never priced at 100%).
// The fragments introduce their own aliases `a` (accessorials) and `apr`
// (accessorial_pay_rates); do not reuse those names in the outer query's FROM.
//
// No user input ever enters these strings. They are constants.
//
// The JS mirror below (netRevenueOf / trailerNetOf) must move in lockstep with
// the SQL; the contract test pins the whitespace-normalised SQL text so editing
// one without the other fails. Run backend/scripts/check-net-parity.mjs against
// a prod dump after any change here or to the pay rates.

import { ValidationError } from "../../utils/error.js";

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
                 WHERE a.load_id = l.load_id)
            , 2)`;

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

// payRates: a plain object { Type: pct }, a Map, or rows [{accessorial_type, pay_pct}].
function rateLookup(payRates) {
  const m = new Map();
  if (payRates instanceof Map) {
    for (const [k, v] of payRates) m.set(k, v);
  } else if (Array.isArray(payRates)) {
    for (const r of payRates) m.set(r.accessorial_type, r.pay_pct);
  } else if (payRates && typeof payRates === "object") {
    for (const [k, v] of Object.entries(payRates)) m.set(k, v);
  }
  return m;
}

// The pay rate for one accessorial: its row's pay_pct when a row exists (a
// 0% row keeps $0 — High Value-EVC), else the schedule's accessorial_pct.
// A null pay_pct is "no row" (COALESCE). Returns a scaled BigInt or null.
function effectivePct(type, rates, schedule) {
  const row = rates.get(type);
  if (!isNil(row)) return scaled(row, RATE_SCALE);
  if (isNil(schedule.accessorial_pct)) return null;
  return scaled(schedule.accessorial_pct, RATE_SCALE);
}

// Mirrors NET_REVENUE_SQL. Like the SQL: a null linehaul / fuel_surcharge /
// linehaul_pct / trailer_pct / fuel_surcharge_pct makes the whole result null
// (columns are NOT NULL in the database, so this is unreachable on real rows);
// a null accessorial amount (or a null effective rate) adds nothing, as SUM does.
export function netRevenueOf(
  { linehaul, fuel_surcharge, accessorials },
  schedule,
  payRates,
) {
  if (
    isNil(linehaul) ||
    isNil(fuel_surcharge) ||
    isNil(schedule?.linehaul_pct) ||
    isNil(schedule?.trailer_pct) ||
    isNil(schedule?.fuel_surcharge_pct)
  ) {
    return null;
  }
  const rates = rateLookup(payRates);
  let total =
    scaled(linehaul, MONEY_SCALE) *
      (scaled(schedule.linehaul_pct, RATE_SCALE) +
        scaled(schedule.trailer_pct, RATE_SCALE)) +
    scaled(fuel_surcharge, MONEY_SCALE) *
      scaled(schedule.fuel_surcharge_pct, RATE_SCALE);
  for (const a of accessorials ?? []) {
    if (isNil(a?.amount)) continue;
    const pct = effectivePct(a.accessorial_type ?? a.type, rates, schedule);
    if (pct === null) continue;
    total += scaled(a.amount, MONEY_SCALE) * pct;
  }
  return toCents(total);
}

// Mirrors TRAILER_NET_SQL: the trailer's % of linehaul plus its % of the
// accessorials whose effective rate equals linehaul_pct + trailer_pct.
export function trailerNetOf({ linehaul, accessorials }, schedule, payRates) {
  if (
    isNil(linehaul) ||
    isNil(schedule?.linehaul_pct) ||
    isNil(schedule?.trailer_pct)
  ) {
    return null;
  }
  const rates = rateLookup(payRates);
  const trailerPct = scaled(schedule.trailer_pct, RATE_SCALE);
  const lhRate = scaled(schedule.linehaul_pct, RATE_SCALE) + trailerPct;
  let base = 0n; // money scale
  for (const a of accessorials ?? []) {
    if (isNil(a?.amount)) continue;
    const pct = effectivePct(a.accessorial_type ?? a.type, rates, schedule);
    if (pct !== null && pct === lhRate) base += scaled(a.amount, MONEY_SCALE);
  }
  return toCents(
    scaled(linehaul, MONEY_SCALE) * trailerPct + trailerPct * base,
  );
}
