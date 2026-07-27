import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  metersToMiles,
  inchesToCm,
  poundsToKg,
  parseGeocode,
  parseRouteMeters,
  parseCitySuggestions,
} from "./hereProvider.js";

describe("unit conversions", () => {
  test("meters → miles", () => {
    assert.equal(metersToMiles(1609.344), 1);
    assert.ok(Math.abs(metersToMiles(100000) - 62.137) < 0.01);
  });

  test("inches → centimeters (HERE wants cm, rounded)", () => {
    assert.equal(inchesToCm(144), 366); // 12'0" wide → 366 cm
    assert.equal(inchesToCm(162), 411); // 13'6" tall
  });

  test("pounds → kilograms (HERE wants kg, rounded)", () => {
    assert.equal(poundsToKg(80000), 36287);
    assert.equal(poundsToKg(0), 0);
  });
});

describe("parseGeocode", () => {
  test("pulls lat/lng from the top hit", () => {
    const json = { items: [{ position: { lat: 32.53, lng: -96.66 } }] };
    assert.deepEqual(parseGeocode(json), { lat: 32.53, lng: -96.66 });
  });

  test("null when no items or malformed", () => {
    assert.equal(parseGeocode({ items: [] }), null);
    assert.equal(parseGeocode({}), null);
    assert.equal(parseGeocode({ items: [{ position: { lat: "x", lng: 1 } }] }), null);
  });
});

describe("parseRouteMeters", () => {
  test("sums section lengths", () => {
    const json = {
      routes: [{ sections: [{ summary: { length: 1000 } }, { summary: { length: 500 } }] }],
    };
    assert.equal(parseRouteMeters(json), 1500);
  });

  test("null when no route", () => {
    assert.equal(parseRouteMeters({ routes: [] }), null);
    assert.equal(parseRouteMeters({}), null);
  });

  test("null when a section is missing its length (don't trust a partial total)", () => {
    const json = { routes: [{ sections: [{ summary: { length: 1000 } }, { summary: {} }] }] };
    assert.equal(parseRouteMeters(json), null);
  });
});

describe("parseCitySuggestions", () => {
  test("maps city + stateCode to {city, state, label}", () => {
    const json = {
      items: [
        { address: { city: "Dallas", stateCode: "TX" } },
        { address: { city: "Dalton", stateCode: "GA" } },
      ],
    };
    assert.deepEqual(parseCitySuggestions(json), [
      { city: "Dallas", state: "TX", label: "Dallas, TX" },
      { city: "Dalton", state: "GA", label: "Dalton, GA" },
    ]);
  });

  test("trims junk, uppercases the state, and de-dupes by city+state", () => {
    const json = {
      items: [
        { address: { city: "Ferris ", stateCode: "tx" } },
        { address: { city: "Ferris", stateCode: "TX" } }, // dup after trim/upper
        { address: { city: "123 Main St", stateCode: "TX" } }, // a street resolving to a city we already have? no — different "city"
      ],
    };
    const out = parseCitySuggestions(json);
    assert.deepEqual(out[0], { city: "Ferris", state: "TX", label: "Ferris, TX" });
    // the second Ferris is deduped
    assert.equal(out.filter((s) => s.city === "Ferris").length, 1);
  });

  test("skips items without a usable city + 2-letter state; caps at the limit", () => {
    const json = {
      items: [
        { address: { city: "Austin", stateCode: "TX" } },
        { address: { stateCode: "TX" } }, // no city
        { address: { city: "Nowhere", stateCode: "Texas" } }, // bad state
        { title: "junk" },
      ],
    };
    assert.deepEqual(parseCitySuggestions(json, 6), [
      { city: "Austin", state: "TX", label: "Austin, TX" },
    ]);
    assert.deepEqual(parseCitySuggestions({}), []);
  });
});
