import { describe, it, expect } from "vitest";
import type { FscBand, FscSchedule } from "@/types/fscSchedule";
import {
  parseFscPaste,
  bandErrors,
  bandFor,
  scheduleInForce,
  bandWords,
  priceWords,
  centsWords,
  fscParWords,
  toDollarsPerMile,
} from "./fscTable";

const BANDS: FscBand[] = [
  { low: 4.0, high: 4.049, cpm: 0.58 },
  { low: 4.05, high: 4.099, cpm: 0.59 },
  { low: 4.1, high: 4.149, cpm: 0.6 },
  { low: 4.15, high: null, cpm: 0.61 },
];

describe("parseFscPaste — a pasted band table becomes bands, and only bands", () => {
  it("reads a dollar-sign table with an 'and up' last line, cents or dollars", () => {
    const text = [
      "Landstar BCO fuel surcharge schedule",
      "Effective 10/01/2026",
      "Low      High      FSC/mi",
      "$4.000 - $4.049    $0.58",
      "$4.050 - $4.099    59¢",
      "$4.100 to $4.149   0.60",
      "$4.150 and up      $0.61",
    ].join("\n");
    const p = parseFscPaste(text);
    expect(p.bands).toEqual(BANDS);
    // the date line has digits but is not a band — shown back, never saved
    expect(p.rejected).toEqual(["Effective 10/01/2026"]);
  });
  it("ignores headers without digits and sorts by the low bound", () => {
    const p = parseFscPaste("FSC\n4.10 4.149 60\n4.00 4.049 58\n");
    expect(p.bands.map((b) => b.low)).toEqual([4.0, 4.1]);
    expect(p.rejected).toEqual([]);
  });
  it("a line with two numbers and no 'and up' is rejected, not guessed", () => {
    expect(parseFscPaste("4.00 0.58").rejected).toEqual(["4.00 0.58"]);
  });
  it("toDollarsPerMile: 58 is cents, 0.58 is dollars, 5 is cents", () => {
    expect(toDollarsPerMile(58)).toBeCloseTo(0.58, 9);
    expect(toDollarsPerMile(0.58)).toBe(0.58);
    expect(toDollarsPerMile(5)).toBe(0.05);
  });
});

describe("bandErrors — the sentences a bad table gets", () => {
  it("a good table has none", () => {
    expect(bandErrors(BANDS)).toEqual([]);
  });
  it("fewer than two bands", () => {
    expect(bandErrors([BANDS[0]])).toContain("a surcharge table needs at least two bands");
  });
  it("overlapping, backwards, out-of-range and a misplaced open band", () => {
    const errs = bandErrors([
      { low: 4.0, high: 4.1, cpm: 0.58 },
      { low: 4.05, high: 4.149, cpm: 0.59 }, // overlaps the first
      { low: 4.3, high: 4.2, cpm: 0.6 }, // backwards
      { low: 4.5, high: null, cpm: 6 }, // open, not last; pays $6
      { low: 4.6, high: 4.7, cpm: 0.62 },
    ]);
    expect(errs).toContain("the bands $4.00–$4.10 and $4.05–$4.149 overlap");
    expect(errs).toContain("the band $4.30–$4.20 runs backwards");
    expect(errs).toContain("the band $4.50 and up pays $6.00 a mile — outside $0–$5");
    expect(errs).toContain('only the last band can run "and up"');
  });
});

describe("bandFor — the band a price falls in", () => {
  it("inside a band, inclusive at both ends", () => {
    expect(bandFor(BANDS, 4.0)?.cpm).toBe(0.58);
    expect(bandFor(BANDS, 4.049)?.cpm).toBe(0.58);
    expect(bandFor(BANDS, 4.05)?.cpm).toBe(0.59);
  });
  it("a price in the gap between two bands reads the band below", () => {
    expect(bandFor(BANDS, 4.0495)?.cpm).toBe(0.58);
  });
  it("the open last band catches everything above it; below the first band there is none", () => {
    expect(bandFor(BANDS, 9.5)?.cpm).toBe(0.61);
    expect(bandFor(BANDS, 3.99)).toBeNull();
    expect(bandFor([], 4.1)).toBeNull();
  });
});

describe("scheduleInForce and the words", () => {
  const S = (effective_from: string): FscSchedule => ({ schedule_id: effective_from, effective_from, bands: BANDS, note: null, created_at: "" });
  it("the latest start on or before the day; none before the first", () => {
    const list = [S("2026-10-01"), S("2026-04-01")];
    expect(scheduleInForce(list, "2026-10-01")?.schedule_id).toBe("2026-10-01");
    expect(scheduleInForce(list, "2026-09-30")?.schedule_id).toBe("2026-04-01");
    expect(scheduleInForce(list, "2026-03-31")).toBeNull();
  });
  it("priceWords, centsWords, bandWords", () => {
    expect(priceWords(4)).toBe("$4.00");
    expect(priceWords(4.049)).toBe("$4.049");
    expect(centsWords(0.58)).toBe("58¢");
    expect(bandWords(BANDS[0])).toBe("$4.00–$4.049");
    expect(bandWords(BANDS[3])).toBe("$4.15 and up");
  });
  it("fscParWords reads like the sheet", () => {
    expect(
      fscParWords({ kind: "table", effective_from: "2026-10-01", price: 5.153, priceIsThisWeek: true, cpm: 0.78, expectedFsc: 1000 }),
    ).toBe("par on Landstar's table (eff. Oct 1) at this week's $5.153: 78¢ a loaded mile");
    expect(
      fscParWords({ kind: "table", effective_from: "2026-10-01", price: 5.02, priceIsThisWeek: false, cpm: 0.74, expectedFsc: 1 }),
    ).toBe("par on Landstar's table (eff. Oct 1) at $5.020: 74¢ a loaded mile");
    expect(fscParWords({ kind: "estimate" })).toMatch(/^par · estimate/);
    expect(fscParWords({ kind: "unknown", reason: "no national diesel price for Sep 2026" })).toBe(
      "par unknown — no national diesel price for Sep 2026",
    );
  });
});
