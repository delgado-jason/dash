import { describe, it, expect } from "vitest";
import type { SettlementSplit } from "@/types/settlementSplit";
import { splitInForce, splitWords, settledOnWords, sortSplits, dayWords } from "./splits";

const BEFORE: SettlementSplit = { split_id: "s0", effective_from: "2026-01-01", linehaul_pct: 0.65, trailer_pct: 0, fuel_surcharge_pct: 1, accessorial_pct: 0.65, note: "before the trailer" };
const TRAILER: SettlementSplit = { split_id: "s1", effective_from: "2026-02-03", linehaul_pct: 0.65, trailer_pct: 0.08, fuel_surcharge_pct: 1, accessorial_pct: 0.73, note: "the trailer's share began with the trailer" };
const SPLITS = [TRAILER, BEFORE]; // out of order on purpose

describe("splitInForce — the latest start on or before the day (NET-01)", () => {
  it("the start day itself is in force; the day before is the older row", () => {
    expect(splitInForce(SPLITS, "2026-02-03")?.split_id).toBe("s1");
    expect(splitInForce(SPLITS, "2026-02-02")?.split_id).toBe("s0");
  });
  it("a January load settles on the pre-trailer row; a day before the first row has none", () => {
    expect(splitInForce(SPLITS, "2026-01-08")?.trailer_pct).toBe(0);
    expect(splitInForce(SPLITS, "2025-12-31")).toBeNull();
    expect(splitInForce([], "2026-06-01")).toBeNull();
  });
  it("sortSplits puts the oldest first", () => {
    expect(sortSplits(SPLITS).map((s) => s.split_id)).toEqual(["s0", "s1"]);
  });
});

describe("the words", () => {
  it("splitWords reads like the sheet, with a tenth of a percent when it matters", () => {
    expect(splitWords(TRAILER)).toBe("linehaul 65% · trailer 8% · fuel surcharge 100% · accessorials 73%");
    expect(splitWords({ linehaul_pct: 0.6525, trailer_pct: 0.0775, fuel_surcharge_pct: 1, accessorial_pct: 0.73 })).toBe(
      "linehaul 65.3% · trailer 7.8% · fuel surcharge 100% · accessorials 73%",
    );
  });
  it("settledOnWords names the schedule's start; null without one", () => {
    expect(settledOnWords("2026-02-03")).toBe("settled on the Feb 3, 2026 schedule");
    expect(settledOnWords(null)).toBeNull();
    expect(dayWords("2026-01-01T05:00:00.000Z")).toBe("Jan 1, 2026");
  });
});
