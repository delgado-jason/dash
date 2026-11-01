import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseFredSeries, fredParams } from "./fredIndexService.js";

describe("parseFredSeries", () => {
  test("maps FRED observations to {month, value}, ascending", () => {
    const json = {
      observations: [
        { date: "2026-01-01", value: "155.359" },
        { date: "2025-12-01", value: "154.2" },
        { date: "2026-02-01", value: "156.0" },
      ],
    };
    assert.deepEqual(parseFredSeries(json), [
      { month: "2025-12", value: 154.2 },
      { month: "2026-01", value: 155.359 },
      { month: "2026-02", value: 156.0 },
    ]);
  });

  test("skips FRED's '.' missing markers and bad rows", () => {
    const json = {
      observations: [
        { date: "2026-01-01", value: "." },
        { date: "2026-02-01", value: "156.0" },
        { date: null, value: "1" },
      ],
    };
    assert.deepEqual(parseFredSeries(json), [{ month: "2026-02", value: 156.0 }]);
  });

  test("empty / malformed payload → []", () => {
    assert.deepEqual(parseFredSeries({}), []);
    assert.deepEqual(parseFredSeries(null), []);
    assert.deepEqual(parseFredSeries({ observations: [] }), []);
  });
});

describe("fredParams", () => {
  test("the PPI is asked for as published; diesel as monthly averages", () => {
    const ppi = fredParams("PCU484230484230", "k");
    assert.equal(ppi.get("series_id"), "PCU484230484230");
    assert.equal(ppi.get("frequency"), null);
    const diesel = fredParams("GASDESW", "k", true);
    assert.equal(diesel.get("frequency"), "m");
    assert.equal(diesel.get("aggregation_method"), "avg");
    assert.equal(diesel.get("observation_start"), "2024-01-01");
  });
});
