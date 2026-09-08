import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  geocode,
  parseAutocompleteCity,
  parseLookup,
  metersToMiles,
  inchesToCm,
  poundsToKg,
  parseGeocode,
  parseGeocodeDetailed,
  validateGeocodeResult,
  parseRouteMeters,
  parseRouteTolls,
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

describe("parseGeocodeDetailed", () => {
  const hit = {
    items: [
      {
        title: "Macedonia, OH, United States",
        resultType: "locality",
        address: { label: "Macedonia, OH, United States", countryCode: "USA", stateCode: "OH" },
        position: { lat: 41.31, lng: -81.5 },
        scoring: { queryScore: 0.99 },
      },
    ],
  };

  test("pulls the trust fields from the top hit", () => {
    assert.deepEqual(parseGeocodeDetailed(hit), {
      found: true,
      lat: 41.31,
      lng: -81.5,
      stateCode: "OH",
      countryCode: "USA",
      resultType: "locality",
      queryScore: 0.99,
      label: "Macedonia, OH, United States",
    });
  });

  test("found:false when nothing usable came back", () => {
    assert.deepEqual(parseGeocodeDetailed({ items: [] }), { found: false });
    assert.deepEqual(parseGeocodeDetailed({}), { found: false });
    assert.deepEqual(
      parseGeocodeDetailed({ items: [{ position: { lat: "x", lng: 1 } }] }),
      { found: false },
    );
  });
});

describe("validateGeocodeResult", () => {
  const good = {
    found: true,
    lat: 41.31,
    lng: -81.5,
    stateCode: "OH",
    countryCode: "USA",
    resultType: "locality",
    queryScore: 0.99,
    label: "Macedonia, OH",
  };

  test("accepts a US, state-matched, in-bounds, high-confidence hit", () => {
    const v = validateGeocodeResult("oh", good);
    assert.equal(v.ok, true);
    assert.deepEqual(v.coords, { lat: 41.31, lng: -81.5 });
  });

  test("rejects a state mismatch (the classic wrong-Springfield guard)", () => {
    const v = validateGeocodeResult("IL", { ...good, stateCode: "MO" });
    assert.equal(v.ok, false);
    assert.match(v.reason, /state_mismatch/);
  });

  test("rejects a non-US result", () => {
    const v = validateGeocodeResult("OH", { ...good, countryCode: "CAN" });
    assert.equal(v.ok, false);
    assert.match(v.reason, /country/);
  });

  test("rejects a point outside US bounds", () => {
    const v = validateGeocodeResult("OH", { ...good, lat: 4.6, lng: -74.1 }); // Bogotá
    assert.equal(v.ok, false);
    assert.equal(v.reason, "out_of_bounds");
  });

  test("rejects a low-confidence match", () => {
    const v = validateGeocodeResult("OH", { ...good, queryScore: 0.55 });
    assert.equal(v.ok, false);
    assert.match(v.reason, /low_score/);
  });

  test("no_match when the API found nothing", () => {
    assert.equal(validateGeocodeResult("OH", { found: false }).ok, false);
    assert.equal(validateGeocodeResult("OH", null).reason, "no_match");
  });

  test("fails closed when HERE returned no confidence score", () => {
    const v = validateGeocodeResult("OH", { ...good, queryScore: null });
    assert.equal(v.ok, false);
    assert.equal(v.reason, "no_score");
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

describe("parseRouteTolls", () => {
  test("sums every fare across every section", () => {
    const json = {
      routes: [
        {
          sections: [
            { tolls: [{ fares: [{ price: { value: 12.5 } }, { price: { value: 3.25 } }] }] },
            { tolls: [{ fares: [{ price: { value: 8 } }] }] },
          ],
        },
      ],
    };
    assert.equal(parseRouteTolls(json), 23.75);
  });

  test("null when there's no toll data (or a toll-free route)", () => {
    assert.equal(parseRouteTolls({ routes: [{ sections: [{ summary: {} }] }] }), null);
    assert.equal(parseRouteTolls({ routes: [{ sections: [{ tolls: [] }] }] }), null);
    assert.equal(parseRouteTolls({}), null);
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

describe("geocode cache", () => {
  test("a no-match response is NOT cached — the next call retries and succeeds", async () => {
    const realFetch = global.fetch;
    const realKey = process.env.HERE_API_KEY;
    process.env.HERE_API_KEY = "test-key";
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return {
        ok: true,
        json: async () =>
          calls === 1
            ? { items: [] } // transient empty answer — must not poison the cache
            : { items: [{ position: { lat: 32.5, lng: -94.74 } }] },
      };
    };
    try {
      const first = await geocode("Cachetestville", "TX");
      assert.equal(first, null);
      const second = await geocode("Cachetestville", "TX");
      assert.deepEqual(second, { lat: 32.5, lng: -94.74 });
      assert.equal(calls, 2); // it went back to the network — null was not cached
      const third = await geocode("Cachetestville", "TX");
      assert.deepEqual(third, { lat: 32.5, lng: -94.74 });
      assert.equal(calls, 2); // the HIT was cached
    } finally {
      global.fetch = realFetch;
      if (realKey === undefined) delete process.env.HERE_API_KEY;
      else process.env.HERE_API_KEY = realKey;
    }
  });
});

describe("parseAutocompleteCity — prominence pick + twin refusal", () => {
  const item = (city, st, label, id) => ({ id, address: { city, stateCode: st, label } });
  test("picks the top exact match; a name variant (Twp) never blocks it", () => {
    const json = { items: [
      item("Walker", "MI", "Walker, MI, United States", "id-real"),
      item("Walker Twp", "MI", "Walker Twp, MI, United States", "id-twp"),
      item("Midway", "TX", "Midway, TX, United States", "id-junk"),
    ]};
    assert.deepEqual(parseAutocompleteCity(json, "Walker", "MI"), { status: "ok", id: "id-real" });
  });
  test("two identical same-state labels = twins -> ambiguous, never a guess", () => {
    const json = { items: [
      item("Milford", "IN", "Milford, IN, United States", "id-north"),
      item("Milford", "IN", "Milford, IN, United States", "id-south"),
    ]};
    assert.equal(parseAutocompleteCity(json, "Milford", "IN").status, "ambiguous");
  });
  test("no exact same-state match -> none (falls back to plain geocode)", () => {
    const json = { items: [item("Walker Twp", "MI", "Walker Twp, MI, United States", "x")] };
    assert.equal(parseAutocompleteCity(json, "Walker", "MI").status, "none");
    assert.equal(parseAutocompleteCity({}, "Walker", "MI").status, "none");
  });
  test("parseLookup extracts a position and rejects junk", () => {
    assert.deepEqual(parseLookup({ position: { lat: 43.0, lng: -85.7 } }), { lat: 43.0, lng: -85.7 });
    assert.equal(parseLookup({ position: { lat: "43" } }), null);
    assert.equal(parseLookup({}), null);
  });
});
