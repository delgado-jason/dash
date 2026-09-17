import { describe, it, expect } from "vitest";
import type { LedgerRow } from "@/lib/metrics/marketLedger";
import {
  colorForRow,
  mapScale,
  metricThin,
  IN_RAMP,
  NO_DATA,
  RATE_RAMP,
  VOL_RAMP,
} from "./mapColor";

const row = (
  state: string,
  over: { loads?: number; typicalRpm?: number | null; deliveries?: number; reload?: number | null },
): LedgerRow => ({
  state,
  name: state,
  markets: [],
  out: {
    loads: over.loads ?? 0,
    typicalRpm: over.typicalRpm ?? null,
    blendedRpm: null,
    perDay: { perDay: null, days: 0, gross: 0, loads: 0 },
    agents: 0,
    gross: 0,
    grade: "thin",
  },
  in: {
    deliveries: over.deliveries ?? 0,
    reloadMilesMedian: over.reload ?? null,
    reloadMilesAvg: null,
    idleDaysAvg: null,
    nextRpmMedian: null,
    reloadedInState: 0,
    grade: "thin",
  },
});

// A cheap reload (100 mi) and an expensive one (500 mi), both thick enough to
// set the scale, plus a one-load market and one with nothing on the IN side.
const ROWS: LedgerRow[] = [
  row("OH", { loads: 4, typicalRpm: 2, deliveries: 5, reload: 100 }),
  row("TX", { loads: 4, typicalRpm: 8, deliveries: 5, reload: 500 }),
  row("VA", { loads: 1, typicalRpm: 6, deliveries: 1, reload: 300 }),
  row("NM", { loads: 3, typicalRpm: null, deliveries: 3, reload: null }),
];
const SCALE = mapScale(ROWS);

describe("mapScale", () => {
  it("takes its ends from the markets thick enough to set them", () => {
    // VA's single load can't stretch the scale to 300 mi or $6.
    expect(SCALE).toMatchObject({ maxOut: 8, minIn: 100, maxIn: 500, maxVolume: 9 });
  });
});

describe("colorForRow — OUT", () => {
  it("shades higher $/mi brighter, up the RATE ramp", () => {
    expect(colorForRow(ROWS[1], "out", SCALE)).toBe(RATE_RAMP[RATE_RAMP.length - 1]);
    const ohio = colorForRow(ROWS[0], "out", SCALE);
    expect(RATE_RAMP.indexOf(ohio)).toBeLessThan(RATE_RAMP.length - 1);
    expect(RATE_RAMP.indexOf(ohio)).toBeGreaterThanOrEqual(0);
  });
});

describe("colorForRow — IN is INVERTED", () => {
  it("paints the SHORTEST reload the brightest, so brighter is better on both", () => {
    const cheap = colorForRow(ROWS[0], "in", SCALE); // 100 mi
    const dear = colorForRow(ROWS[1], "in", SCALE); // 500 mi
    expect(cheap).toBe(IN_RAMP[IN_RAMP.length - 1]);
    expect(dear).toBe(IN_RAMP[0]);
    expect(IN_RAMP.indexOf(cheap)).toBeGreaterThan(IN_RAMP.indexOf(dear));
  });

  it("falls to the bright end when every market reloads the same", () => {
    const flat = [
      row("A", { deliveries: 3, reload: 200 }),
      row("B", { deliveries: 3, reload: 200 }),
    ];
    expect(colorForRow(flat[0], "in", mapScale(flat))).toBe(
      IN_RAMP[IN_RAMP.length - 1],
    );
  });
});

describe("colorForRow — volume", () => {
  it("shades loads out plus deliveries up the VOL ramp", () => {
    expect(colorForRow(ROWS[1], "volume", SCALE)).toBe(VOL_RAMP[VOL_RAMP.length - 1]);
  });
});

describe("the hatch and the dark", () => {
  it("hatches a market with a single load on the metric's own side", () => {
    expect(metricThin(ROWS[2], "out")).toBe(true); // 1 load out
    expect(metricThin(ROWS[2], "in")).toBe(true); // 1 delivery
    expect(metricThin(ROWS[2], "volume")).toBe(false); // 1 + 1 = 2
    expect(metricThin(ROWS[0], "out")).toBe(false);
  });

  it("does not hatch a market it has never heard of — that is NO_DATA", () => {
    expect(metricThin(undefined, "out")).toBe(false);
    expect(colorForRow(undefined, "out", SCALE)).toBe(NO_DATA);
    expect(colorForRow(undefined, "in", SCALE)).toBe(NO_DATA);
  });

  it("goes dark, never bright, when a thick market has no figure at all", () => {
    expect(colorForRow(ROWS[3], "out", SCALE)).toBe(NO_DATA); // no rate
    expect(colorForRow(ROWS[3], "in", SCALE)).toBe(NO_DATA); // no logged reload
  });
});
