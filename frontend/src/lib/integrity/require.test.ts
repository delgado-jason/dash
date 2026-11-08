import { describe, expect, it } from "vitest";
import { missingWords, requireInputs } from "./require";

const words = {
  payroll: { label: "weekly payroll", fixAt: "ASSUMPTIONS" },
  advance: { label: "the fuel advance", fixAt: "ASSUMPTIONS" },
  floor: { label: "the Maintenance floor", fixAt: "EDIT PLAN", fixTo: "/status" },
};

describe("requireInputs — a missing input is never zero", () => {
  it("returns the numbers when every input is present, strings coerced", () => {
    const r = requireInputs({ payroll: "1908.00", advance: 2000, floor: 5000 }, words);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.values).toEqual({ payroll: 1908, advance: 2000, floor: 5000 });
  });

  it("a typed zero is a real answer, not a gap", () => {
    const r = requireInputs({ payroll: 0, advance: "0", floor: 5000 }, words);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.values.payroll).toBe(0);
  });

  it("names every missing input with its words, in input order", () => {
    const r = requireInputs({ payroll: null, advance: "", floor: Number.NaN }, words);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missing.map((m) => m.key)).toEqual(["payroll", "advance", "floor"]);
      expect(r.missing[0]).toEqual({ key: "payroll", label: "weekly payroll", fixAt: "ASSUMPTIONS" });
      expect(r.missing[2].fixTo).toBe("/status");
    }
  });

  it("reads as a sentence fragment", () => {
    const one = requireInputs({ payroll: undefined }, { payroll: words.payroll });
    const two = requireInputs({ payroll: null, advance: null }, { payroll: words.payroll, advance: words.advance });
    const three = requireInputs({ payroll: null, advance: null, floor: null }, words);
    expect(missingWords(one.ok ? [] : one.missing)).toBe("weekly payroll isn't set");
    expect(missingWords(two.ok ? [] : two.missing)).toBe("weekly payroll and the fuel advance aren't set");
    expect(missingWords(three.ok ? [] : three.missing)).toBe("weekly payroll, the fuel advance and the Maintenance floor aren't set");
    expect(missingWords([])).toBe("");
  });
});
