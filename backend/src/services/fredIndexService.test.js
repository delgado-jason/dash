import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseFredSeries } from "./fredIndexService.js";

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
