import { describe, it, expect } from "vitest";
import type { FscScalePoint } from "@/types/fscScalePoint";
import { parseScalePaste, scalePasteErrors, fitScale, scaleCpmAt, pointForDay, pointWords, fitWords, usDateKey } from "./fscScale";

const NOV3: FscScalePoint = {
  point_id: "p1",
  week_of: "2026-11-03",
  national_avg: 6.292,
  cents_per_mile: 0.86,
  pct_of_linehaul: 0.52,
  regions: [
    { region: "PADD 1A", price: 6.416, cpm: 0.88 },
    { region: "PADD 4", price: 6.445, cpm: 0.89 },
    { region: "PADD 5", price: 7.272, cpm: 1.03 },
  ],
  note: null,
};

describe("parseScalePaste — the report's header lines, or the one line", () => {
  it("reads the Ranger report header: the week, the national line, the % line and the PADD lines", () => {
    const text = [
      "Landstar National Diesel Fuel Surcharge Report effective 11/03/26 through 11/09/26 or as otherwise noted.",
      "Landstar Fuel Surcharge scale based on:",
      "National Average $6.292 .86 cents per mile",
      "National Average $6.292 52% of the linehaul",
      "New England (PADD 1A) $6.416 .88 cents per mile",
      "Rocky Mountain (PADD 4) $6.445 .89 cents per mile",
      "West Coast (PADD 5) $7.272 1.03 cents per mile",
    ].join("\n");
    const p = parseScalePaste(text);
    expect(p.week_of).toBe("2026-11-03");
    expect(p.national_avg).toBe(6.292);
    expect(p.cents_per_mile).toBe(0.86);
    expect(p.pct_of_linehaul).toBe(0.52);
    expect(p.regions).toEqual(NOV3.regions);
    expect(p.rejected).toEqual([]);
    expect(scalePasteErrors(p)).toEqual([]);
  });
  it("the one line alone, cents or dollars, needs a date before it can be saved", () => {
    const p = parseScalePaste("National Average $6.292 86");
    expect(p.national_avg).toBe(6.292);
    expect(p.cents_per_mile).toBe(0.86);
    expect(p.week_of).toBeNull();
    expect(scalePasteErrors(p)).toEqual(['the week needs its date — the report\'s "effective" line, or type it']);
  });
  it("a second national line is shown back, never guessed; a line with no rate is rejected", () => {
    const p = parseScalePaste("effective 11/03/26\nNational Average $6.292 .86\nNational Average $6.300 .87\n$6.1");
    expect(p.cents_per_mile).toBe(0.86);
    expect(p.rejected).toEqual(["National Average $6.300 .87", "$6.1"]);
  });
  it("usDateKey reads two- and four-digit years and refuses a non-date", () => {
    expect(usDateKey("effective 11/03/26 through 11/09/26")).toBe("2026-11-03");
    expect(usDateKey("1/5/2027")).toBe("2027-01-05");
    expect(usDateKey("no date here")).toBeNull();
  });
});

describe("fitScale — the scale from the points", () => {
  it("one report with its PADD lines already fits: about a $1.29 peg at 5.81 mpg, every published cent matched", () => {
    const f = fitScale([NOV3]);
    expect(f).not.toBeNull();
    expect(f!.reports).toBe(1);
    expect(f!.pairs).toBe(4);
    expect(f!.peg).toBeGreaterThan(1.0);
    expect(f!.peg).toBeLessThan(1.6);
    expect(f!.mpg).toBeGreaterThan(5.5);
    expect(f!.mpg).toBeLessThan(6.1);
    expect(f!.maxMissCents).toBe(0);
    for (const [price, cents] of [[6.292, 0.86], [6.416, 0.88], [6.445, 0.89], [7.272, 1.03]] as const) expect(scaleCpmAt(f!, price)).toBe(cents);
  });
  it("a national-only point has one price: no fit, never a guessed scale", () => {
    expect(fitScale([{ ...NOV3, regions: [] }])).toBeNull();
    expect(fitScale([])).toBeNull();
  });
  it("two national-only weeks at different prices fit a line", () => {
    const a = { ...NOV3, regions: [], pct_of_linehaul: null };
    const b = { ...a, point_id: "p2", week_of: "2026-10-27", national_avg: 6.14, cents_per_mile: 0.83 };
    const f = fitScale([a, b]);
    expect(f).not.toBeNull();
    expect(scaleCpmAt(f!, 6.292)).toBe(0.86);
    expect(scaleCpmAt(f!, 6.14)).toBe(0.83);
  });
  it("the fitted cents never go below zero", () => {
    const f = fitScale([NOV3])!;
    expect(scaleCpmAt(f, 0.5)).toBe(0);
  });
});

describe("pointForDay and the words", () => {
  it("a day inside the report's week reads that report; the next week does not", () => {
    expect(pointForDay([NOV3], "2026-11-03")?.point_id).toBe("p1");
    expect(pointForDay([NOV3], "2026-11-09")?.point_id).toBe("p1");
    expect(pointForDay([NOV3], "2026-11-10")).toBeNull();
    expect(pointForDay([NOV3], "2026-11-02")).toBeNull();
  });
  it("pointWords and fitWords read like the sheet", () => {
    expect(pointWords(NOV3)).toBe("national $6.292 → 86¢ / mi · 52% of the linehaul · PADD 1A $6.416 → 88¢ · PADD 4 $6.445 → 89¢ · PADD 5 $7.272 → 103¢");
    const f = fitScale([NOV3])!;
    expect(fitWords(f)).toMatch(/^cents per mile = \(price − \$\d\.\d\d\) ÷ \d\.\d\d mpg · 1 report, 4 points · worst miss 0¢$/);
  });
});
