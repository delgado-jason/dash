import { describe, it, expect } from "vitest";
import { guessKind, nextKind, kindLabel } from "./serviceKind";

describe("guessKind — one rule for the row logged tomorrow and the row filed last spring", () => {
  const g = (description: string, over: Partial<Parameters<typeof guessKind>[0]> = {}) =>
    guessKind({ description, itemCount: 0, unit: "tractor", apuHours: null, cost: 100, ...over });

  it("reads Jason's sixteen rows the way the migration does", () => {
    expect(g("APU hour meter reading", { unit: "apu", apuHours: 13413, cost: null })).toBe("reading");
    expect(g("Truck wash", { itemCount: 1 })).toBe("wash"); // a wash that reset the wash clock is still a wash
    expect(g("Replaced passenger-side inner tandem tire with b")).toBe("tire");
    expect(g("Full PM", { itemCount: 6 })).toBe("pm");
    expect(g("Landstar Ultimate PM: oil change, X15 oil filter", { itemCount: 6 })).toBe("pm");
    expect(g("Warning lights on dash, Passenger front drive brake")).toBe("repair");
    expect(g("Turbocharger actuator R&R, intake throttle valve")).toBe("repair");
    expect(g("Replace alternator and belt on APU.  Checked", { unit: "apu", itemCount: 1 })).toBe("pm");
  });

  it("a reading with money on it is not a reading", () => {
    expect(g("APU hour meter reading and oil", { unit: "apu", apuHours: 13413, cost: 300 })).toBe("repair");
  });

  it("an inspection is named by its word", () => {
    expect(g("Annual DOT inspection")).toBe("inspection");
    expect(g("Inspect brakes and lines", { itemCount: 2 })).toBe("inspection");
  });
});

describe("nextKind / kindLabel", () => {
  it("cycles in order and wraps; an unknown kind starts at PM", () => {
    expect(nextKind("pm")).toBe("repair");
    expect(nextKind("reading")).toBe("pm");
    expect(nextKind(null)).toBe("pm");
    expect(kindLabel("tire")).toBe("Tire");
    expect(kindLabel(null)).toBe("—");
  });
});
