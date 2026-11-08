import { describe, expect, it } from "vitest";
import { cleanLines, countWords, groupIssues, sinceWords } from "./present";
import type { Issue, IntegrityInputs } from "./issue";
import type { Load } from "@/types/load";
import type { Obligation } from "@/types/obligation";
import type { CostBasis } from "@/lib/metrics/rateTargets";

const issue = (key: string, severity: Issue["severity"], since: string | null): Issue => ({
  id: key.split(":")[0],
  key,
  severity,
  title: key,
  detail: "",
  fixAt: "Loads",
  fixTo: "/loads",
  since,
  records: [],
});

const load = (n: string, over: Partial<Load> = {}): Load =>
  ({ load_id: n, load_number: n, load_status: "delivered", odometer_start: 1, odometer_end: 2, ...over }) as Load;

const bill = (over: Partial<Obligation> = {}): Obligation =>
  ({ active: true, is_draw: false, day_of_month: 5, current_balance: null, balance_as_of: null, ...over }) as Obligation;

const inputs = (over: Partial<IntegrityInputs> = {}): IntegrityInputs =>
  ({
    today: "2026-11-06",
    role: "admin",
    loads: [],
    obligations: [],
    basis: null,
    ...over,
  }) as IntegrityInputs;

const basis = (over: Partial<CostBasis> = {}): CostBasis =>
  ({ months: 6, monthsWanted: 6, missingLabel: null, ...over }) as CostBasis;

describe("groupIssues / countWords", () => {
  const list = [
    issue("D:a", "data", "2026-10-01"),
    issue("M:old", "money", "2026-09-01"),
    issue("M:new", "money", "2026-11-01"),
    issue("D:b", "data", null),
  ];
  it("money first, newest first, undated last", () => {
    const g = groupIssues(list);
    expect(g.money.map((i) => i.key)).toEqual(["M:new", "M:old"]);
    expect(g.data.map((i) => i.key)).toEqual(["D:a", "D:b"]);
  });
  it("counts in words", () => {
    expect(countWords(list)).toBe("money 2 · data 2");
    expect(countWords([])).toBe("money 0 · data 0");
  });
});

describe("sinceWords", () => {
  it("reads the day as text", () => {
    expect(sinceWords("2026-11-04")).toBe("Nov 4");
    expect(sinceWords("2026-01-30")).toBe("Jan 30");
    expect(sinceWords(null)).toBeNull();
  });
});

describe("cleanLines", () => {
  it("names what passed", () => {
    const lines = cleanLines(
      inputs({
        loads: [load("1"), load("2")],
        basis: basis(),
        obligations: [bill({ current_balance: 100, balance_as_of: "2026-11-01" })],
      }),
      [],
    );
    expect(lines).toEqual([
      "2 delivered loads carry both readings",
      "6 of 6 basis months filed",
      "every active bill has its draft day",
      "every tracked note has a balance date",
    ]);
  });

  it("a partial pass is not a clean line", () => {
    const lines = cleanLines(
      inputs({
        loads: [load("1"), load("2", { odometer_end: null })],
        basis: basis({ months: 5, missingLabel: "Oct ’26" }),
        obligations: [bill({ day_of_month: null }), bill({ current_balance: 5, balance_as_of: null })],
      }),
      [],
    );
    expect(lines).toEqual([]);
  });

  it("a dispatcher is told only about the records she enters", () => {
    const lines = cleanLines(inputs({ role: "dispatcher", loads: [load("1")], basis: basis() }), []);
    expect(lines).toEqual(["1 delivered load carries both readings"]);
  });
});
