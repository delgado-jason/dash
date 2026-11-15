import { describe, it, expect } from "vitest";
import { RATE_TIERS } from "@/lib/constants/targets";
import { quoteTable, quoteSentence } from "./quoteTable";

// The Nod Sheet's own example (C4 rev 4): 750 driven miles, specialized,
// $2,520 of permits and escorts grossed up at a 0.73 linehaul take, a $4.0347
// break-even. The sheet printed $6,478 / $7,655 / $7,970 / $8,333 against a
// $7,800 offer — "clears your minimum by $145 · ask $170 more to hit target".
const SPEC = { ...RATE_TIERS, minimum: 0.389, target: 0.493, prime: 0.613 };
const BE = 4.0347;
const MILES = 750;
const ASK = 2520 / 0.73;

const near = (actual: number, wanted: number, within = 1.5) =>
  expect(Math.abs(actual - wanted)).toBeLessThan(within);

describe("quoteTable", () => {
  it("prices every rung with the pass-through folded in, and marks where the offer fell", () => {
    const t = quoteTable(BE, MILES, SPEC, ASK, 7800)!;
    expect(t.rows.map((r) => r.rung)).toEqual(["breakEven", "minimum", "target", "prime"]);
    near(t.rows[0].quote, 6478);
    near(t.rows[1].quote, 7655);
    near(t.rows[2].quote, 7970);
    near(t.rows[3].quote, 8333);
    expect(t.cleared?.rung).toBe("minimum");
    near(t.cleared!.gap!, 145);
    expect(t.next?.rung).toBe("target");
    near(t.next!.gap!, -170);
    expect(t.rows[0].cleared).toBe(true);
    expect(t.rows[3].cleared).toBe(false);
  });

  it("carries the margin each rung earns and the rate per driven mile it needs", () => {
    const t = quoteTable(BE, MILES, SPEC, ASK, 7800)!;
    expect(t.rows[0].margin).toBe(0);
    expect(t.rows[1].margin).toBeCloseTo(0.28, 2);
    expect(t.rows[2].margin).toBeCloseTo(0.33, 2);
    expect(t.rows[3].margin).toBeCloseTo(0.38, 2);
    expect(t.rows[0].rpm).toBeCloseTo(BE, 4);
    expect(t.rows[1].rpm).toBeCloseTo(BE * 1.389, 3);
  });

  it("reads as the sentence under the verdict", () => {
    expect(quoteSentence(quoteTable(BE, MILES, SPEC, ASK, 7800), "specialized")).toBe(
      "clears your specialized minimum by $145 · ask $170 more to hit target",
    );
  });

  it("without an offer the gaps are null, nothing is cleared, and there is no sentence", () => {
    const t = quoteTable(BE, MILES, SPEC, ASK, null)!;
    expect(t.rows.every((r) => r.gap == null && !r.cleared)).toBe(true);
    expect(t.cleared).toBeNull();
    expect(t.next).toBeNull();
    expect(quoteSentence(t, "specialized")).toBeNull();
  });

  it("an offer under break-even clears nothing and says how short it is", () => {
    const t = quoteTable(BE, MILES, SPEC, ASK, 6000)!;
    expect(t.cleared).toBeNull();
    expect(t.next?.rung).toBe("breakEven");
    expect(quoteSentence(t, "specialized")).toBe("short of break-even by $478");
  });

  it("an offer above prime clears prime and has nothing left to ask", () => {
    const t = quoteTable(BE, MILES, SPEC, ASK, 9000)!;
    expect(t.cleared?.rung).toBe("prime");
    expect(t.next).toBeNull();
    expect(quoteSentence(t, "specialized")).toBe("clears your specialized prime by $667");
  });

  it("break-even carries no tier word — it is one number for both sets", () => {
    const t = quoteTable(BE, MILES, SPEC, ASK, 7000)!;
    expect(t.cleared?.rung).toBe("breakEven");
    expect(quoteSentence(t, "specialized")).toMatch(/^clears break-even by \$522 · ask \$655 more to hit minimum$/);
  });

  it("with no pass-throughs the quote is the rung alone", () => {
    const t = quoteTable(BE, MILES, SPEC, 0, 5000)!;
    near(t.rows[0].quote, 3026);
    const neg = quoteTable(BE, MILES, SPEC, -40, 5000)!;
    near(neg.rows[0].quote, 3026); // a negative ask is no ask
  });

  it("an offer typed as the printed whole-dollar quote still clears that rung", () => {
    const exact = quoteTable(BE, MILES, SPEC, ASK, null)!.rows[1].quote; // 7655.20
    const t = quoteTable(BE, MILES, SPEC, ASK, Math.round(exact))!;
    expect(t.cleared?.rung).toBe("minimum");
  });

  it("is null without a cost basis or without miles — never a table of zeros", () => {
    expect(quoteTable(null, MILES, SPEC, ASK, 7800)).toBeNull();
    expect(quoteTable(BE, 0, SPEC, ASK, 7800)).toBeNull();
    expect(quoteSentence(null, "standard")).toBeNull();
  });
});
