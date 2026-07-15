import { describe, it, expect } from "vitest";
import { underLoadDaySet, underLoadRuns } from "./underLoad";
import type { Load } from "@/types/load";

const L = (pickup_date: string, delivery_date: string): Load =>
  ({ load_status: "delivered", pickup_date, delivery_date }) as unknown as Load;

describe("underLoadDaySet", () => {
  it("counts every day of a pickup→delivery span, inclusive", () => {
    const set = underLoadDaySet([L("2026-02-02", "2026-02-04")], null, "9999-12-31");
    expect([...set].sort()).toEqual(["2026-02-02", "2026-02-03", "2026-02-04"]);
  });

  it("dedupes overlapping loads — a day counts once", () => {
    const set = underLoadDaySet(
      [L("2026-02-02", "2026-02-04"), L("2026-02-03", "2026-02-05")],
      null,
      "9999-12-31",
    );
    expect(set.size).toBe(4); // 02-02..02-05
  });

  it("bounds to the window", () => {
    const set = underLoadDaySet([L("2026-01-30", "2026-02-03")], "2026-02-01", "2026-02-02");
    expect([...set].sort()).toEqual(["2026-02-01", "2026-02-02"]);
  });

  it("ignores non-delivered loads", () => {
    const booked = { load_status: "booked", pickup_date: "2026-02-02", delivery_date: "2026-02-03" } as unknown as Load;
    expect(underLoadDaySet([booked], null, "9999-12-31").size).toBe(0);
  });
});

describe("underLoadRuns", () => {
  it("returns the length of each consecutive run", () => {
    // 02-02..02-04 (3), gap, 02-07..02-08 (2)
    const runs = underLoadRuns([L("2026-02-02", "2026-02-04"), L("2026-02-07", "2026-02-08")]);
    expect(runs.sort((a, b) => a - b)).toEqual([2, 3]);
  });

  it("merges touching spans into one run", () => {
    const runs = underLoadRuns([L("2026-02-02", "2026-02-03"), L("2026-02-04", "2026-02-05")]);
    expect(runs).toEqual([4]); // 02-02..02-05 unbroken
  });

  it("returns empty for no loads", () => {
    expect(underLoadRuns([])).toEqual([]);
  });
});
