// The SQL that feeds every revenue number: NET-01, NET-02, NET-04, NET-05, NET-07.
//
// Rule-change gate: a red test here means a revenue rule moved. The PR body must
// carry 'Rule change: <id> — <why>'. Never edit a golden number to turn this green
// without saying so. Fixtures are synthetic and inline.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  NET_REVENUE_SQL,
  TRAILER_NET_SQL,
  REIMBURSEMENTS_SQL,
  GROSS_ACCESSORIALS_SQL,
  SPLIT_JOIN_SQL,
  NO_SCHEDULE_MESSAGE,
  assertScheduleRow,
  assertSplitCoverage,
  noSplitMessage,
  netRevenueOf,
  trailerNetOf,
  reimbursementsOf,
} from "../services/sql/netRevenue.js";

const servicesDir = fileURLToPath(new URL("../services/", import.meta.url));
const norm = (s) => s.replace(/\s+/g, " ").trim();

const SCHEDULE = {
  linehaul_pct: 0.65,
  trailer_pct: 0.08,
  fuel_surcharge_pct: 1,
  accessorial_pct: 0.73,
};
const PAY_RATES = { Tarp: 1.0, Hazmat: 0.73, "High Value-EVC": 0 };
const LOAD = {
  linehaul: 2000,
  fuel_surcharge: 600,
  accessorials: [
    { type: "Tarp", amount: 150 },
    { type: "Hazmat", amount: 100 },
    { type: "Job-Site Delivery", amount: 200 },
  ],
};

describe("NET-01 · net revenue = the schedule's cut of each component", () => {
  test("pinned 2dp result on the synthetic load", () => {
    // derived: linehaul 2000 x (0.65 + 0.08) = 1460.00
    //        + FSC 600 x 1 = 600.00
    //        + Tarp 150 x 1.00 (rate row) = 150.00
    //        + Hazmat 100 x 0.73 (rate row) = 73.00
    //        + Job-Site Delivery 200 x 0.73 (no row: accessorial_pct) = 146.00
    //        = 2429.00
    assert.equal(netRevenueOf(LOAD, SCHEDULE, PAY_RATES), 2429);
  });

  test("rounds to 2dp, half away from zero, like Postgres numeric ROUND", () => {
    // derived: 100.10 x 0.65 = 65.065 -> 65.07 (a float would give 65.06)
    const l = { linehaul: 100.1, fuel_surcharge: 0, accessorials: [] };
    const s = { ...SCHEDULE, trailer_pct: 0 };
    assert.equal(netRevenueOf(l, s, {}), 65.07);
  });

  test("nulls behave as the SQL does", () => {
    // SUM ignores a null amount; no accessorials = COALESCE(SUM, 0) = 0
    assert.equal(
      netRevenueOf(
        { ...LOAD, accessorials: [{ type: "Tarp", amount: null }] },
        SCHEDULE,
        PAY_RATES,
      ),
      2060, // derived: 1460 + 600
    );
    assert.equal(
      netRevenueOf({ ...LOAD, accessorials: null }, SCHEDULE, PAY_RATES),
      2060,
    );
    // a null pay_pct is no row: COALESCE falls to accessorial_pct
    assert.equal(
      netRevenueOf(
        { ...LOAD, accessorials: [{ type: "Tarp", amount: 100 }] },
        SCHEDULE,
        { Tarp: null },
      ),
      2133, // derived: 1460 + 600 + 100 x 0.73
    );
    // a null base column makes the whole expression null (as ROUND(NULL))
    assert.equal(
      netRevenueOf({ ...LOAD, fuel_surcharge: null }, SCHEDULE, PAY_RATES),
      null,
    );
  });
});

describe("NET-02 · gross is the revenue components — a pass-through reimbursement is not revenue (Q8, 2026-11-05; built 2026-11-08)", () => {
  const PASS_RATES = { ...PAY_RATES, Tolls: { pay_pct: 1.0, pass_through: true } };
  const WITH_TOLL = { ...LOAD, accessorials: [...LOAD.accessorials, { type: "Tolls", amount: 200 }] };

  test("gross_revenue and total_accessorials read GROSS_ACCESSORIALS_SQL at both SELECTs", () => {
    const text = readFileSync(join(servicesDir, "loadServices.js"), "utf8");
    assert.equal(text.match(/\$\{GROSS_ACCESSORIALS_SQL\} AS total_accessorials/g)?.length, 2);
    assert.equal(norm(text).match(/linehaul \+ fuel_surcharge \+ \$\{GROSS_ACCESSORIALS_SQL\} AS gross_revenue/g)?.length, 2);
    assert.equal(text.match(/\$\{REIMBURSEMENTS_SQL\} AS reimbursements/g)?.length, 2);
  });

  test("GROSS_ACCESSORIALS_SQL is pinned: every accessorial that is not a pass-through", () => {
    assert.equal(norm(GROSS_ACCESSORIALS_SQL), '(SELECT COALESCE(SUM(a.amount), 0) FROM accessorials a LEFT JOIN accessorial_pay_rates apr ON apr.user_id = l.user_id AND apr.accessorial_type = a.accessorial_type WHERE a.load_id = l.load_id AND NOT COALESCE(apr.pass_through, FALSE))');
  });

  test("a $200 toll marked pass-through leaves the earned net exactly where it was", () => {
    assert.equal(netRevenueOf(WITH_TOLL, SCHEDULE, PASS_RATES), netRevenueOf(LOAD, SCHEDULE, PAY_RATES));
    assert.equal(netRevenueOf(WITH_TOLL, SCHEDULE, PASS_RATES), 2429);
  });

  test("the toll rides in reimbursements at its pay rate; a load with no pass-through has none", () => {
    assert.equal(reimbursementsOf(WITH_TOLL, PASS_RATES), 200);
    assert.equal(reimbursementsOf(LOAD, PASS_RATES), 0);
    // the same toll typed without the flag is ordinary revenue at its rate
    assert.equal(reimbursementsOf(WITH_TOLL, { ...PAY_RATES, Tolls: 1.0 }), 0);
    assert.equal(netRevenueOf(WITH_TOLL, SCHEDULE, { ...PAY_RATES, Tolls: 1.0 }), 2629);
  });

  test("the trailer's share never rides on a pass-through, even one paid at the linehaul rate", () => {
    const rates = { ...PAY_RATES, Tolls: { pay_pct: 0.73, pass_through: true } };
    assert.equal(trailerNetOf(WITH_TOLL, SCHEDULE, rates), trailerNetOf(LOAD, SCHEDULE, PAY_RATES));
  });

  test("REIMBURSEMENTS_SQL is pinned", () => {
    assert.equal(norm(REIMBURSEMENTS_SQL), 'ROUND( (SELECT COALESCE(SUM(a.amount * apr.pay_pct), 0) FROM accessorials a JOIN accessorial_pay_rates apr ON apr.user_id = l.user_id AND apr.accessorial_type = a.accessorial_type AND apr.pass_through WHERE a.load_id = l.load_id) , 2)');
  });
});

describe("NET-04 · the trailer's share", () => {
  test("pinned trailer net on the synthetic load", () => {
    // derived: linehaul 2000 x 0.08 = 160.00
    //        + 0.08 x (accessorials paid at 0.65 + 0.08 = 0.73:
    //                  Hazmat 100 + Job-Site Delivery 200 = 300) = 24.00
    //        Tarp is paid at 100% and FSC at 100%: tractor's, not the trailer's.
    //        = 184.00
    assert.equal(trailerNetOf(LOAD, SCHEDULE, PAY_RATES), 184);
  });

  test("no trailer = no trailer net", () => {
    assert.equal(
      trailerNetOf(LOAD, { ...SCHEDULE, trailer_pct: 0 }, PAY_RATES),
      0,
    );
  });
});

describe("NET-05 · accessorials keep a per-type rate, else accessorial_pct", () => {
  test("an unrated type takes accessorial_pct", () => {
    const l = {
      linehaul: 0,
      fuel_surcharge: 0,
      accessorials: [{ type: "Job-Site Delivery", amount: 200 }],
    };
    assert.equal(netRevenueOf(l, SCHEDULE, PAY_RATES), 146); // derived: 200 x 0.73
  });

  test("a rated type takes its own rate, not accessorial_pct", () => {
    const l = {
      linehaul: 0,
      fuel_surcharge: 0,
      accessorials: [{ type: "Tarp", amount: 150 }],
    };
    assert.equal(netRevenueOf(l, SCHEDULE, PAY_RATES), 150); // derived: 150 x 1.00
  });

  test("High Value-EVC at a 0% rate keeps $0 (a 0 row is a row, not 'no row')", () => {
    const l = {
      linehaul: 0,
      fuel_surcharge: 0,
      accessorials: [{ type: "High Value-EVC", amount: 500 }],
    };
    assert.equal(netRevenueOf(l, SCHEDULE, PAY_RATES), 0); // derived: 500 x 0
  });

  test("the type match is exact (a mistyped name loses its rate)", () => {
    const l = {
      linehaul: 0,
      fuel_surcharge: 0,
      accessorials: [{ type: "tarp", amount: 150 }],
    };
    assert.equal(netRevenueOf(l, SCHEDULE, PAY_RATES), 109.5); // derived: 150 x 0.73
  });

  test("rates may be given as rows, as the table returns them", () => {
    const rows = [{ accessorial_type: "Tarp", pay_pct: "1.00" }];
    const l = {
      linehaul: 0,
      fuel_surcharge: 0,
      accessorials: [{ type: "Tarp", amount: 150 }],
    };
    assert.equal(netRevenueOf(l, SCHEDULE, rows), 150);
  });
});

describe("NET-01/04/05 · one source for the SQL", () => {
  const loadServices = readFileSync(join(servicesDir, "loadServices.js"), "utf8");

  test("loadServices.js uses NET_REVENUE_SQL and TRAILER_NET_SQL at both SELECTs", () => {
    assert.equal(loadServices.match(/\$\{NET_REVENUE_SQL\} AS net_revenue/g)?.length, 2);
    assert.equal(loadServices.match(/\$\{TRAILER_NET_SQL\} AS trailer_net/g)?.length, 2);
  });

  test("no inline linehaul_pct anywhere under backend/src/services except sql/netRevenue.js", () => {
    const offenders = [];
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".js") && !p.endsWith(join("sql", "netRevenue.js"))) {
          if (readFileSync(p, "utf8").includes("linehaul_pct")) offenders.push(p);
        }
      }
    };
    walk(servicesDir);
    // settlementScheduleServices.js owns the schedule's own columns (its
    // DEFAULTS, validation and upsert), which are not a net-revenue formula.
    const unexpected = offenders.filter(
      (p) => !p.endsWith("settlementScheduleServices.js") && !p.endsWith("settlementSplitServices.js"),
    );
    assert.deepEqual(unexpected, []);
  });

  test("the SQL constants carry no inline schedule fallbacks (NET-07)", () => {
    assert.ok(!/COALESCE\(ss\./.test(NET_REVENUE_SQL));
    assert.ok(!/COALESCE\(ss\./.test(TRAILER_NET_SQL));
  });
});

describe("NET-01/04 · SQL <-> JS lockstep", () => {
  test("SPLIT_JOIN_SQL is pinned: the split in force on the load's day (NET-01, Q10 2026-11-05)", () => {
    assert.equal(norm(SPLIT_JOIN_SQL), 'LEFT JOIN LATERAL ( SELECT s.linehaul_pct, s.trailer_pct, s.fuel_surcharge_pct, s.accessorial_pct, s.effective_from FROM settlement_splits s WHERE s.user_id = l.user_id AND s.effective_from <= COALESCE(l.delivery_date, l.pickup_date, CURRENT_DATE) ORDER BY s.effective_from DESC LIMIT 1 ) AS ss ON TRUE');
    assert.match(SPLIT_JOIN_SQL, /LEFT JOIN LATERAL/); // NULLs for an uncovered load — refused before it runs
  });

  test("NET_REVENUE_SQL is pinned: edit the SQL, the mirror and this pin together", () => {
    assert.equal(
      norm(NET_REVENUE_SQL),
      "ROUND( l.linehaul * (ss.linehaul_pct + ss.trailer_pct) + l.fuel_surcharge * ss.fuel_surcharge_pct + (SELECT COALESCE(SUM( a.amount * COALESCE(apr.pay_pct, ss.accessorial_pct) ), 0) FROM accessorials a LEFT JOIN accessorial_pay_rates apr ON apr.user_id = l.user_id AND apr.accessorial_type = a.accessorial_type WHERE a.load_id = l.load_id AND NOT COALESCE(apr.pass_through, FALSE)) , 2)",
    );
  });

  test("TRAILER_NET_SQL is pinned", () => {
    assert.equal(
      norm(TRAILER_NET_SQL),
      "ROUND( l.linehaul * ss.trailer_pct + ss.trailer_pct * ( SELECT COALESCE(SUM(a.amount), 0) FROM accessorials a LEFT JOIN accessorial_pay_rates apr ON apr.user_id = l.user_id AND apr.accessorial_type = a.accessorial_type WHERE a.load_id = l.load_id AND NOT COALESCE(apr.pass_through, FALSE) AND COALESCE(apr.pay_pct, ss.accessorial_pct) = ss.linehaul_pct + ss.trailer_pct) , 2)",
    );
  });
});

describe("NET-07 · no schedule row is refused, not priced at 100%", () => {
  test("the refusal helper throws the sentence Jason can act on", () => {
    assert.throws(
      () => assertScheduleRow(undefined),
      (e) =>
        e.name === "ValidationError" &&
        e.statusCode === 400 &&
        e.message === "no settlement schedule — set it in Settings",
    );
    assert.equal(NO_SCHEDULE_MESSAGE, "no settlement schedule — set it in Settings");
  });

  test("a row that exists passes through untouched", () => {
    const row = { "?column?": 1 };
    assert.equal(assertScheduleRow(row), row);
  });

  // The service needs a database to run, so its wiring is pinned on the text:
  // an existence check before each query, and an INNER JOIN, never a LEFT JOIN.
  test("loadServices checks for the schedule row AND every load's split, and joins the split at both SELECTs", () => {
    const text = readFileSync(join(servicesDir, "loadServices.js"), "utf8");
    assert.equal(text.match(/await requireSchedule\(user_id\);/g)?.length, 2);
    assert.equal(text.match(/await requireSplitCoverage\(user_id\);/g)?.length, 2);
    assert.match(text, /assertScheduleRow\(result\.rows\[0\]\)/);
    assert.match(text, /assertSplitCoverage\(result\.rows\[0\]\)/);
    assert.equal(text.match(/\$\{SPLIT_JOIN_SQL\}/g)?.length, 2);
    assert.ok(!/JOIN settlement_schedules/.test(text)); // the undated row is settings now, not a price
  });

  test("a load before the first split is refused with the load and its day named (NET-01 + NET-07)", () => {
    const uncovered = { load_number: "1234567", day: "2026-01-03" };
    assert.equal(
      noSplitMessage(uncovered),
      "load 1234567 (Jan 3, 2026) is before your first settlement split — add a split from that day in Settings",
    );
    assert.throws(() => assertSplitCoverage(uncovered), (e) => e.name === "ValidationError" && e.statusCode === 400);
    assert.doesNotThrow(() => assertSplitCoverage(undefined));
  });
});
