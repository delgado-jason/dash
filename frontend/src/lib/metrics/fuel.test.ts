import { describe, it, expect } from "vitest";
import { estimateLoadFuel, ASSUMED_MPG, ASSUMED_FUEL_PRICE } from "./fuel";

describe("estimateLoadFuel", () => {
  it("estimates from loaded + deadhead miles when odometer is missing", () => {
    const f = estimateLoadFuel({ loaded_miles: 1000, deadhead_miles: 100 });
    expect(f?.basis).toBe("estimated");
    expect(f?.miles).toBe(1100);
    expect(f?.gallons).toBeCloseTo(1100 / ASSUMED_MPG);
    expect(f?.cost).toBeCloseTo((1100 / ASSUMED_MPG) * ASSUMED_FUEL_PRICE);
  });

  // CHANGED in v1.267.1. This used to assert that an UNKNOWN deadhead
  // estimated from the loaded miles alone — `(Number(x) || 0)` quietly turned
  // "nobody logged it" into "zero empty miles", undercounting the fuel while
  // the KPI two inches above refused the same input with "needs the odometer".
  // The panel now refuses too.
  it("refuses to estimate when the deadhead is UNKNOWN — a null is not a zero", () => {
    expect(estimateLoadFuel({ loaded_miles: 800, deadhead_miles: null })).toBeNull();
  });

  it("...but a deadhead of 0 is a real answer and still estimates", () => {
    // Zero empty miles means the truck was already at the shipper.
    const f = estimateLoadFuel({ loaded_miles: 800, deadhead_miles: 0 });
    expect(f?.basis).toBe("estimated");
    expect(f?.miles).toBe(800);
  });

  it("refuses when the loaded miles are unknown too", () => {
    expect(estimateLoadFuel({ loaded_miles: null, deadhead_miles: 100 })).toBeNull();
  });

  it("the odometer window still wins over both", () => {
    // A known window answers the question even with no deadhead logged.
    const f = estimateLoadFuel({
      loaded_miles: 800,
      deadhead_miles: null,
      odometer_start: 1000,
      odometer_end: 1950,
    });
    expect(f?.basis).toBe("actual");
    expect(f?.miles).toBe(950);
  });

  it("uses actual odometer miles once both readings are present", () => {
    const f = estimateLoadFuel({
      loaded_miles: 1000,
      deadhead_miles: 100,
      odometer_start: 568000,
      odometer_end: 569200,
    });
    expect(f?.basis).toBe("actual");
    expect(f?.miles).toBe(1200);
  });

  it("falls back to estimate when odometer_end is not greater than start", () => {
    const f = estimateLoadFuel({
      loaded_miles: 500,
      deadhead_miles: 0,
      odometer_start: 569000,
      odometer_end: 569000,
    });
    expect(f?.basis).toBe("estimated");
    expect(f?.miles).toBe(500);
  });

  it("returns null when there are no miles to work with", () => {
    expect(estimateLoadFuel({ loaded_miles: 0, deadhead_miles: 0 })).toBeNull();
    expect(estimateLoadFuel({ loaded_miles: null, deadhead_miles: null })).toBeNull();
  });
});
