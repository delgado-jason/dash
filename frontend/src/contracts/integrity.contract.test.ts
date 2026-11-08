// INT-01 · the integrity checks, one seeded defect each. The clean book raises
// nothing; every check fires exactly once on exactly one defect, with the
// sentence the page prints. Rules named: NET-05 (settled vs expected net),
// NET-10/11/12 (pay rates and the fallback), BASIS-02 (an unfiled month),
// ODO-04/05 (the odometer chain and its windows), PLAN-09 (the accrual).
import { describe, it, expect } from "vitest";
import { syntheticBook, brokenPeriod, TODAY, type Book } from "@/test/fixtures/book";
import { computeRateTargets, monthlyObligationCost } from "@/lib/metrics/rateTargets";
import { runIntegrityChecks } from "@/lib/integrity/checks";
import { sortIssues, visibleTo, type IntegrityInputs, type Issue } from "@/lib/integrity/issue";

const now = new Date(`${TODAY}T00:00:00Z`);

// The inputs the page assembles, from a book.
const inputsOf = (book: Book): IntegrityInputs => ({
  today: TODAY,
  role: "owner",
  loads: book.loads,
  trips: book.trips,
  fuel: book.fuel,
  settlements: book.settlements,
  settlementLines: book.settlementLines,
  periods: book.periods,
  financials: book.financials,
  obligations: book.obligations,
  accessorials: book.accessorials,
  payRates: book.payRates,
  schedule: book.schedule,
  perDiemRates: book.perDiemRates,
  snapshots: book.snapshots,
  accounts: book.accounts,
  plan: book.plan,
  assumptions: book.assumptions,
  services: [],
  basis: computeRateTargets(book.loads, book.periods, monthlyObligationCost(book.obligations), book.schedule, now).basis,
});

// The book has Job-Site Delivery unrated on purpose; the clean book rates it.
const cleanBook = (): Book => {
  const b = syntheticBook();
  b.payRates.push({ accessorial_type: "Job-Site Delivery", pay_pct: 0.73 });
  return b;
};
const cleanInputs = (): IntegrityInputs => inputsOf(cleanBook());

// Seed one defect into a clean book, return the findings.
const seed = (mutate: (b: Book) => void, after?: (i: IntegrityInputs) => void): Issue[] => {
  const b = cleanBook();
  mutate(b);
  const i = inputsOf(b);
  after?.(i);
  return runIntegrityChecks(i);
};

const only = (issues: Issue[], id: string, severity: Issue["severity"], title: RegExp): Issue => {
  expect(issues.map((x) => x.id)).toEqual([id]);
  expect(issues[0].severity).toBe(severity);
  expect(issues[0].title).toMatch(title);
  return issues[0];
};

describe("INT-01 · the clean book", () => {
  it("the clean book raises no issue", () => {
    expect(runIntegrityChecks(cleanInputs())).toEqual([]);
  });

  it("the raw book raises exactly its deliberate Job-Site Delivery gap", () => {
    const issues = runIntegrityChecks(inputsOf(syntheticBook()));
    expect(issues.map((x) => x.id)).toEqual(["INT-ACC-UNRATED"]);
  });
});

describe("INT-01 · BASIS-02 · INT-PNL-UNFILED", () => {
  it("an unfiled month is named with the months the basis stands on", () => {
    const i = only(
      seed((b) => (b.periods[5] = brokenPeriod(b.periods[5]))),
      "INT-PNL-UNFILED",
      "money",
      /^No P&L for Oct ’26 — break-even stands on 5 of 6 months\.$/,
    );
    expect(i.fixAt).toBe("Expenses → upload");
    expect(i.fixTo).toBe("/expenses");
    expect(i.since).toBe("2026-10-01");
    expect(i.key).toBe("INT-PNL-UNFILED:2026-10-01");
  });

  it("two unfiled months make two issues, each on 4 of 6", () => {
    const issues = seed((b) => {
      b.periods[4] = brokenPeriod(b.periods[4]);
      b.periods[5] = brokenPeriod(b.periods[5], { cogs_total: 1, expense_total: null });
    });
    expect(issues.map((x) => x.id)).toEqual(["INT-PNL-UNFILED", "INT-PNL-UNFILED"]);
    expect(issues.every((x) => /4 of 6 months/.test(x.title))).toBe(true);
  });
});

describe("INT-01 · INT-PNL-VS-CASH", () => {
  it("a P&L total that disagrees with the pasted month names the gap", () => {
    only(
      seed((b) => {
        b.periods[2].expense_total = (b.periods[2].expense_total ?? 0) + 2101.43;
      }),
      "INT-PNL-VS-CASH",
      "money",
      /^Jul ’26: your P&L upload and your pasted month disagree — opex \$2,101\.43 apart\. One of them is wrong\.$/,
    );
  });

  it("a difference inside a cent is quiet", () => {
    expect(
      seed((b) => {
        b.periods[2].expense_total = (b.periods[2].expense_total ?? 0) + 0.01;
      }),
    ).toEqual([]);
  });
});

describe("INT-01 · INT-CASH-CONTINUITY", () => {
  it("a month that opens off the last close is named with the signed gap", () => {
    // Shifting Sep's beginning also breaks nothing else: ending is not re-checked here.
    const i = only(
      seed((b) => {
        b.financials[4].beginning_cash = (Number(b.financials[4].beginning_cash) + 567.75).toFixed(2);
      }),
      "INT-CASH-CONTINUITY",
      "money",
      /^Sep ’26 opens at \$[\d,]+\.\d{2} but Aug closed at \$[\d,]+\.\d{2} \(\+\$567\.75\)\. Re-paste one of them\.$/,
    );
    expect(i.fixAt).toBe("Cash Flow → PASTE MONTHS");
    expect(i.fixTo).toBe("/cashflow");
  });
});

describe("INT-01 · NET-05 · INT-LOAD-UNRECORDED", () => {
  it("a statement line for an unknown load names the load and its statements", () => {
    const base = syntheticBook().settlementLines.find((l) => l.line_class === "linehaul");
    if (!base) throw new Error("fixture has no linehaul line");
    const i = only(
      seed((b) => {
        b.settlementLines.push({ ...base, line_id: "x-1", load_number: "9199999", revenue: 1563.9, description: "Load 9199999" });
      }),
      "INT-LOAD-UNRECORDED",
      "data",
      /paid load 9199999 \(.+ statement, linehaul \$1,563\.90\) — it isn't in dash\.$/,
    );
    expect(i.fixTo).toBe("/loads");
  });

  it("a line dated before the first load is not flagged", () => {
    const base = syntheticBook().settlementLines.find((l) => l.line_class === "linehaul");
    if (!base) throw new Error("fixture has no linehaul line");
    expect(
      seed((b) => {
        b.settlementLines.push({ ...base, line_id: "x-2", load_number: "9199998", period_ending: "2026-01-07" });
      }),
    ).toEqual([]);
  });
});

describe("INT-01 · INT-LOAD-VOIDED", () => {
  it("VOIDED LOAD on a delivered load's line names the load and its gross", () => {
    let id = "";
    const i = only(
      seed((b) => {
        const line = b.settlementLines.find((l) => l.load_number === "9100005" && l.line_class === "linehaul");
        if (!line) throw new Error("no line");
        line.description = "VOIDED LOAD 9100005";
        id = b.loads.find((l) => l.load_number === "9100005")?.load_id ?? "";
      }),
      "INT-LOAD-VOIDED",
      "data",
      /^Load 9100005 is delivered in dash \(\$\d[\d,]*\) but .+'s statement says VOIDED LOAD\.$/,
    );
    expect(i.fixTo).toBe(`/loads/${id}`);
    expect(i.fixAt).toBe("Loads → 9100005");
  });
});

describe("INT-01 · NET-05 · INT-NET-MISMATCH", () => {
  it("settled $200 over dash's net says an accessorial is missing", () => {
    only(
      seed((b) => {
        const line = b.settlementLines.find((l) => l.load_number === "9100007" && l.line_class === "linehaul");
        if (!line) throw new Error("no line");
        line.revenue = Number(line.revenue) + 200;
      }),
      "INT-NET-MISMATCH",
      "money",
      /^Load 9100007 settled \$200\.00 over dash's net — an escort or permit isn't entered as an accessorial\.$/,
    );
  });

  it("settled under says a line was reversed or short-paid", () => {
    only(
      seed((b) => {
        const line = b.settlementLines.find((l) => l.load_number === "9100007" && l.line_class === "linehaul");
        if (!line) throw new Error("no line");
        line.revenue = Number(line.revenue) - 50.5;
      }),
      "INT-NET-MISMATCH",
      "money",
      /^Load 9100007 settled \$50\.50 under dash's net — a line was reversed or short-paid\.$/,
    );
  });
});

describe("INT-01 · ODO-04 · INT-ODO-OVERLAP", () => {
  it("two windows that overlap are named, touching windows are not", () => {
    const issues = seed((b) => {
      const l = b.loads.find((x) => x.load_number === "9100010");
      if (!l) throw new Error("no load");
      l.odometer_start = Number(l.odometer_start) - 10; // reaches back into 9100009's window
    });
    const i = only(issues, "INT-ODO-OVERLAP", "data", /^Loads 9100009 and 9100010 overlap on the odometer — one reading is off\.$/);
    expect(i.fixAt).toBe("Loads → 9100009");
  });
});

describe("INT-01 · NET-10 · NET-11 · NET-12 · INT-ACC-UNRATED", () => {
  it("an accessorial type with no pay rate is paid at the fallback, said out loud", () => {
    const i = only(
      seed((b) => {
        b.payRates = b.payRates.filter((r) => r.accessorial_type !== "Job-Site Delivery");
      }),
      "INT-ACC-UNRATED",
      "money",
      /^Job-Site Delivery has no pay rate — paid at the 73% fallback\.$/,
    );
    expect(i.fixAt).toBe("Settings → pay rates");
    expect(i.fixTo).toBe("/settings");
  });
});

describe("INT-01 · PLAN-09 · ODO-05 · INT-SNAPSHOT-MILES", () => {
  it("a snapshot that accrued a week at 0 mi against the chain's miles", () => {
    const i = only(
      seed((b) => {
        const s = b.snapshots.find((x) => x.as_of === "2026-10-23");
        if (!s) throw new Error("no snapshot");
        s.miles = null;
      }),
      "INT-SNAPSHOT-MILES",
      "money",
      /^Oct 23 snapshot accrued the Oct 14 week at 0 mi; the odometer says [\d,]+ mi \(\$[\d,]+\.\d{2}\)\.$/,
    );
    expect(i.fixAt).toBe("Plan → the snapshot");
    expect(i.fixTo).toBe("/status");
    expect(i.since).toBe("2026-10-23");
  });

  it("miles stored too high read as too much", () => {
    only(
      seed((b) => {
        const s = b.snapshots.find((x) => x.as_of === "2026-10-23");
        if (!s) throw new Error("no snapshot");
        s.miles = Number(s.miles) + 100;
      }),
      "INT-SNAPSHOT-MILES",
      "money",
      /too much\)\.$/,
    );
  });
});

describe("INT-01 · INT-ATTRIBUTION", () => {
  it("a delivered load with no booked_by", () => {
    only(
      seed((b) => {
        const l = b.loads.find((x) => x.load_number === "9100003");
        if (l) l.booked_by = null;
      }),
      "INT-ATTRIBUTION",
      "data",
      /^Load 9100003 has no dispatcher \(booked_by\)\.$/,
    );
  });
});

describe("INT-01 · INT-SETTING", () => {
  it("per diem below the IRS rate", () => {
    const i = only(
      seed((b) => {
        b.perDiemRates = b.perDiemRates.slice(0, 1);
      }),
      "INT-SETTING",
      "money",
      /^Per diem is \$69\/day; the IRS transportation rate is \$80\.$/,
    );
    expect(i.since).toBeNull();
    expect(i.fixTo).toBe("/settings");
  });

  it("no rate covers today", () => {
    const i = only(
      seed((b) => {
        b.perDiemRates = [];
      }),
      "INT-SETTING",
      "money",
      /^No per-diem rate covers today — every day out is unpriced until one does\.$/,
    );
    expect(i.fixTo).toBe("/settings");
  });

  it("a future row is not in force", () => {
    const i = seed((b) => {
      b.perDiemRates = [b.perDiemRates[1], { rate_id: "pdr-2027", effective_from: "2027-10-01", rate: 86, note: null }];
    });
    expect(i.filter((x) => x.id === "INT-SETTING")).toEqual([]);
  });
});

describe("INT-01 · INT-NOTE-UNDATED", () => {
  it("a tracked balance with no as-of date", () => {
    only(
      seed((b) => {
        const o = b.obligations.find((x) => x.obligation_id === "obl-truck-note");
        if (o) o.balance_as_of = null;
      }),
      "INT-NOTE-UNDATED",
      "money",
      /^Truck Note · a balance with no as-of date — the payoff shows the statement until you retype the balance\.$/,
    );
  });
});

describe("INT-01 · INT-INPUT-BLANK", () => {
  it("a blank planning input is named with the line that refuses", () => {
    only(
      seed((b) => {
        (b.assumptions as unknown as Record<string, string | null>).weekly_payroll = null;
      }),
      "INT-INPUT-BLANK",
      "money",
      /^Weekly payroll isn't set — the cash board refuses its payroll line until it is\.$/,
    );
  });

  it("no assumptions at all is one issue", () => {
    const i = runIntegrityChecks({ ...cleanInputs(), assumptions: null });
    expect(i.map((x) => x.id)).toEqual(["INT-INPUT-BLANK"]);
    expect(i[0].title).toBe("No planning assumptions yet — the cash board can't project a period.");
  });
});

describe("INT-01 · INT-LOAD-READINGS", () => {
  it("a delivered load without its end odometer", () => {
    only(
      seed((b) => {
        const l = b.loads.find((x) => x.load_number === "9100012");
        if (l) l.odometer_end = null;
      }),
      "INT-LOAD-READINGS",
      "data",
      /^Load 9100012 is delivered without its end odometer — empty miles, the accrual and break-even skip it\.$/,
    );
  });
});

describe("INT-01 · order and audience", () => {
  const many = (): Issue[] =>
    seed((b) => {
      b.perDiemRates = b.perDiemRates.slice(0, 1);
      b.periods[5] = brokenPeriod(b.periods[5]);
      const a = b.loads.find((x) => x.load_number === "9100003");
      const c = b.loads.find((x) => x.load_number === "9100020");
      if (a) a.booked_by = null;
      if (c) c.booked_by = null;
    });

  it("sortIssues reads money before data, newest first within each", () => {
    const sorted = sortIssues([...many()].reverse());
    const sev = sorted.map((x) => x.severity);
    expect(sev).toEqual([...sev].sort((a, b) => (a === b ? 0 : a === "money" ? -1 : 1)));
    const data = sorted.filter((x) => x.severity === "data");
    expect(data.map((x) => x.since)).toEqual([...data.map((x) => x.since)].sort().reverse());
    expect(sorted.map((x) => x.key)).toEqual(many().map((x) => x.key));
  });

  it("keys are unique", () => {
    const keys = many().map((x) => x.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("a dispatcher sees only the data rows", () => {
    const issues = many();
    expect(visibleTo(issues, true).every((x) => x.severity === "data")).toBe(true);
    expect(visibleTo(issues, true).length).toBeGreaterThan(0);
    expect(visibleTo(issues, false)).toEqual(issues);
  });
});
