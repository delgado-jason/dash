import { describe, it, expect } from "vitest";
import { fuelStats, latestTankRecap } from "./fuelEconomy";
import { fuelTaxLine, lastTankSentence, unassignedLine, vendorSentence } from "./fuelWords";

const NOW = new Date("2026-11-15T00:00:00Z");
const d = (odometer_reading: number, gallons: number, price_per_gallon: number, fuel_date: string, filled_to_top = true) => ({
  odometer_reading,
  gallons,
  price_per_gallon,
  fuel_date,
  filled_to_top,
  kind: "diesel",
});

describe("lastTankSentence", () => {
  it("reads the mock's shape: the close, the miles and gallons, both deltas, the money, the rate, the price", () => {
    // Two tanks in the window: 1,000 mi on 150 gal at $5 (6.67), then 982 mi on
    // 137 gal (a 7.8-gal partial at $5.399 and a 129.1-gal full at $5.192).
    const book = [
      d(612474, 120, 5.0, "2026-11-01"),
      d(613474, 150, 5.0, "2026-11-06"),
      d(614239, 7.8, 5.399, "2026-11-13", false),
      d(614456, 129.1, 5.192, "2026-11-14"),
    ];
    const stats = fuelStats(book, NOW);
    const recap = latestTankRecap(stats, [{ month: "2026-11", value: 6.21 }]);
    const s = lastTankSentence(recap, "Tuscumbia, AL", stats, [{ month: "2026-11", value: 6.21 }]);
    expect(s).toMatch(/^The last tank closed Nov 14 at Tuscumbia, AL: 982 miles on 137 gallons, 7\.17 MPG — 0\.2\d above your lifetime, 0\.5\d above the tank before it\. \$712 for the tank, \$0\.73 a mile against \$0\.7\d over the last thirty days, \$5\.20 a gallon against the EIA's \$6\.21 for November\.$/);
  });

  it("the first tank, alone in the window, with no EIA figure — every gap said", () => {
    const stats = fuelStats([d(100000, 120, 5, "2026-11-01"), d(100600, 100, 5, "2026-11-05")], NOW);
    const s = lastTankSentence(latestTankRecap(stats, []), null, stats, []);
    expect(s).toBe(
      "The last tank closed Nov 5: 600 miles on 100 gallons, 6.00 MPG — level with your lifetime. $500 for the tank, $0.83 a mile — the only tank in the last thirty days, $5.00 a gallon — no EIA figure for November yet.",
    );
  });

  it("names the DEF inside the tank; says so when no tank has closed", () => {
    const stats = fuelStats(
      [d(100000, 120, 5, "2026-11-01"), { ...d(100300, 10, 3, "2026-11-03", false), kind: "def" }, d(100600, 100, 5, "2026-11-05")],
      NOW,
    );
    expect(lastTankSentence(latestTankRecap(stats, []), null, stats, [])).toContain("$530 for the tank ($30 of it DEF), $0.88 a mile");
    expect(lastTankSentence(null, null, fuelStats([], NOW), [])).toMatch(/^No full tank has closed yet/);
  });
});

describe("vendorSentence", () => {
  const line = (vendor: string | null, fills: number, gallons: number, ppg: number | null) => ({ vendor, fills, gallons, spend: ppg == null ? 0 : ppg * gallons, ppg });

  it("the dearest named vendor against the cheapest, the gap across the dearest one's gallons", () => {
    expect(
      vendorSentence([line("TA·Petro", 20, 2317, 5.04), line("Pilot Flying J", 13, 1554, 5.07), line("Love's", 14, 1714, 5.2557), line(null, 11, 1300, 3.97)]),
    ).toBe("Love's runs 22¢ a gallon over TA·Petro on your own receipts — about $370 across those 14 fills");
  });

  it("a gap of a dollar or more reads in dollars", () => {
    expect(vendorSentence([line("Stage", 14, 1691, 5.58), line("TA·Petro", 3, 321, 4.56)])).toBe(
      "Stage runs $1.02 a gallon over TA·Petro on your own receipts — about $1,720 across those 14 fills",
    );
  });

  it("needs two vendors with three fills each; a one-cent gap is no gap", () => {
    expect(vendorSentence([line("TA·Petro", 20, 2317, 5.04), line("Chubbys", 1, 8, 5.4)])).toBeNull();
    expect(vendorSentence([])).toBeNull();
    expect(vendorSentence([line("TA·Petro", 5, 600, 5.04), line("Love's", 5, 600, 5.044)])).toBe(
      "Love's and TA·Petro price within a cent of each other on your own receipts",
    );
  });
});

describe("fuelTaxLine · unassignedLine", () => {
  it("lists the months since the log began, newest first; says when there is none", () => {
    const months = [
      { month: "2026-09", amount: 91, settlementEnding: "2026-10-28" },
      { month: "2026-08", amount: 58, settlementEnding: "2026-09-30" },
      { month: "2026-04", amount: 40, settlementEnding: "2026-05-27" }, // before the log — not the check's business
    ];
    expect(fuelTaxLine(months, "2026-05-24")).toBe("Landstar's FUEL TAX on the settlements: Sep $91 · Aug $58 — the gallons below are what it is figured from");
    expect(fuelTaxLine([], "2026-05-24")).toMatch(/^no FUEL TAX line on the settlements yet/);
  });

  it("names the unassigned fills with their span", () => {
    expect(unassignedLine({ fills: 17, gal: 1975.4, spend: 8213, from: "2026-05-24", to: "2026-07-08" })).toBe(
      "17 fills unassigned — May 24 to Jul 8, the import — 1,975 gal · $8,213",
    );
    expect(unassignedLine({ fills: 1, gal: 100, spend: 500, from: "2026-05-24", to: "2026-05-24" })).toBe("1 fill unassigned — May 24, the import — 100 gal · $500");
  });
});
