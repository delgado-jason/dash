import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  metersToMiles,
  inchesToCm,
  poundsToKg,
  parseGeocode,
  parseRouteMeters,
  parseRoutePolylines,
  buildMapImageUrl,
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

describe("parseRoutePolylines", () => {
  test("collects a polyline per section", () => {
    const json = { routes: [{ sections: [{ polyline: "AAA" }, { polyline: "BBB" }] }] };
    assert.deepEqual(parseRoutePolylines(json), ["AAA", "BBB"]);
  });

  test("null when there's no geometry", () => {
    assert.equal(parseRoutePolylines({ routes: [{ sections: [{}] }] }), null);
    assert.equal(parseRoutePolylines({}), null);
  });
});

describe("buildMapImageUrl", () => {
  test("builds a v3 URL with size, line + point overlays, and %23-encoded color", () => {
    const url = buildMapImageUrl({
      apiKey: "K",
      width: 640,
      height: 300,
      lines: [{ polyline: "ABC", color: "f5b03a", width: 5 }],
      points: [{ lat: 32.5, lng: -96.6, color: "4ade80" }],
    });
    assert.ok(url.startsWith("https://image.maps.hereapi.com/mia/v3/base/mc/overlay:padding=40/640x300/png"));
    assert.ok(url.includes("apiKey=K"));
    assert.ok(url.includes("overlay=line:ABC;color=%23f5b03a;width=5"));
    assert.ok(url.includes("overlay=multiPoint:32.5,-96.6;color=%234ade80;size=large"));
    // the raw '#' must never appear (it would truncate the URL at the fragment)
    assert.ok(!url.includes("#"));
  });

  test("falls back to raw coords for a line when no polyline", () => {
    const url = buildMapImageUrl({
      apiKey: "K",
      lines: [{ coords: [1, 2, 3, 4], color: "6f7a8c", width: 4 }],
    });
    assert.ok(url.includes("overlay=line:1,2,3,4;color=%236f7a8c;width=4"));
  });
});
