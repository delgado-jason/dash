#!/usr/bin/env node
// Parity check: does netRevenueOf (the JS mirror of NET_REVENUE_SQL) reproduce
// what Landstar actually settled? Run BY HAND after any change to
// NET_REVENUE_SQL, the schedule, or the accessorial pay rates. Never run by CI.
//
//   node backend/scripts/check-net-parity.mjs <dump-dir>
//
// Reads CSV exports from <dump-dir>, READ-ONLY (no database, no writes).
// Expected files and the columns used (extra columns are ignored):
//   loads.csv                  user_id, load_id, load_number, load_status, linehaul, fuel_surcharge
//   accessorials.csv           load_id, accessorial_type, amount
//   settlement_schedule.csv    user_id, linehaul_pct, trailer_pct, fuel_surcharge_pct, accessorial_pct
//                              (settlement_schedules.csv, the table's own name, is accepted too)
//   accessorial_pay_rates.csv  user_id, accessorial_type, pay_pct
//   settlement_lines.csv       load_number, revenue (other columns ignored)
//
// For every delivered load that has settlement lines: expected = netRevenueOf(...),
// settled = Σ settlement_lines.revenue for its load_number. Reversal / adjustment
// rows (is_adjustment = t, negative revenue) are INCLUDED on purpose: Landstar
// re-rates a load by reversing the original lines and re-posting them, so the
// reversal is what nets the superseded original out. Excluding them double-counts
// every re-rated load (40 of 73 match on the 2026-11-04 dump, vs 53 exact / 58
// within a cent when they are kept).
// Reports: matched to the penny (exact cents), matched within $0.01 (Landstar
// rounds the 65% and 8% linehaul lines separately, so one-cent drift is normal),
// and every load that is off by more than a cent, one line each.
// Delivered loads with no settlement lines are counted separately, not as misses.
// Exit code 0 always (it is a report).

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { netRevenueOf } from "../src/services/sql/netRevenue.js";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node check-net-parity.mjs <dump-dir>");
  process.exit(2);
}

function parseCsv(text) {
  const rows = [];
  let r = [];
  let f = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          f += '"';
          i++;
        } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      r.push(f);
      f = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      r.push(f);
      f = "";
      if (r.length > 1 || r[0] !== "") rows.push(r);
      r = [];
    } else f += c;
  }
  if (f !== "" || r.length) {
    r.push(f);
    rows.push(r);
  }
  const [head, ...body] = rows;
  return body.map((x) => Object.fromEntries(head.map((k, i) => [k, x[i] ?? ""])));
}

function table(...names) {
  for (const n of names) {
    const p = join(dir, `${n}.csv`);
    if (existsSync(p)) return parseCsv(readFileSync(p, "utf8"));
  }
  console.error(`missing ${names[0]}.csv in ${dir}`);
  process.exit(2);
}

const blank = (v) => v === "" || v === undefined;
const num = (v) => (blank(v) ? null : Number(v));
const cents = (n) => Math.round(n * 100);
const money = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(2);

const loads = table("loads");
const accessorials = table("accessorials");
const schedules = table("settlement_schedule", "settlement_schedules");
const rates = table("accessorial_pay_rates");
const lines = table("settlement_lines");

const scheduleOf = new Map(schedules.map((s) => [s.user_id, s]));
const ratesOf = new Map();
for (const r of rates) {
  if (!ratesOf.has(r.user_id)) ratesOf.set(r.user_id, {});
  ratesOf.get(r.user_id)[r.accessorial_type] = num(r.pay_pct);
}
const accOf = new Map();
for (const a of accessorials) {
  if (!accOf.has(a.load_id)) accOf.set(a.load_id, []);
  accOf.get(a.load_id).push({ accessorial_type: a.accessorial_type, amount: num(a.amount) });
}
const settled = new Map();
for (const l of lines) {
  if (blank(l.load_number)) continue;
  settled.set(l.load_number, (settled.get(l.load_number) ?? 0) + (num(l.revenue) ?? 0));
}

let matched = 0;
let withinCent = 0;
let noLines = 0;
let noSchedule = 0;
const misses = [];
const delivered = loads.filter((l) => l.load_status === "delivered");
for (const l of delivered) {
  if (!settled.has(l.load_number)) {
    noLines++;
    continue;
  }
  const sched = scheduleOf.get(l.user_id);
  if (!sched) {
    noSchedule++;
    continue;
  }
  const expected = netRevenueOf(
    {
      linehaul: num(l.linehaul),
      fuel_surcharge: num(l.fuel_surcharge),
      accessorials: accOf.get(l.load_id) ?? [],
    },
    {
      linehaul_pct: num(sched.linehaul_pct),
      trailer_pct: num(sched.trailer_pct),
      fuel_surcharge_pct: num(sched.fuel_surcharge_pct),
      accessorial_pct: num(sched.accessorial_pct),
    },
    ratesOf.get(l.user_id) ?? {},
  );
  const got = settled.get(l.load_number);
  if (expected !== null && cents(expected) === cents(got)) matched++;
  else if (expected !== null && Math.abs(cents(expected) - cents(got)) === 1) withinCent++;
  else misses.push({ load_number: l.load_number, expected, got });
}

const compared = matched + withinCent + misses.length;
console.log(`delivered loads:            ${delivered.length}`);
console.log(`  with settlement lines:    ${compared + noSchedule}`);
console.log(`  no settlement lines yet:  ${noLines}`);
if (noSchedule) console.log(`  user has no schedule:     ${noSchedule} (skipped)`);
console.log(`matched to the penny:       ${matched} of ${compared}`);
console.log(`off by exactly one cent:    ${withinCent}`);
console.log(`matched within $0.01:       ${matched + withinCent} of ${compared}`);
console.log(`mismatched (> $0.01):       ${misses.length}`);
for (const m of misses) {
  const diff = m.expected === null ? null : m.got - m.expected;
  console.log(
    `  ${m.load_number}  expected ${m.expected === null ? "null" : money(m.expected)}  settled ${money(m.got)}  difference ${diff === null ? "n/a" : money(diff)} (settled - expected)`,
  );
}
