import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { footprintPointOf } from "./footprintPoint.js";

// Load 2543056 in miniature: a tradeshow pickup in Atlanta delivered to the
// agent's own customer in Troutman.
const atlantaToTroutman = (customer_end) => ({
  customer_end,
  origin_city: "Atlanta",
  origin_state: "GA",
  destination_city: "Troutman",
  destination_state: "NC",
});

describe("footprintPointOf", () => {
  test("shipper → the origin is the market", () => {
    assert.deepEqual(footprintPointOf(atlantaToTroutman("shipper")), {
      city: "Atlanta",
      state: "GA",
    });
  });

  test("receiver → the destination is the market (2543056)", () => {
    assert.deepEqual(footprintPointOf(atlantaToTroutman("receiver")), {
      city: "Troutman",
      state: "NC",
    });
  });

  test("neither → no point at all", () => {
    assert.equal(footprintPointOf(atlantaToTroutman("neither")), null);
  });

  test("a missing or unknown mark reads as shipper — a pre-074 row is unchanged", () => {
    assert.deepEqual(footprintPointOf(atlantaToTroutman(undefined)), {
      city: "Atlanta",
      state: "GA",
    });
    assert.deepEqual(footprintPointOf(atlantaToTroutman(null)), {
      city: "Atlanta",
      state: "GA",
    });
    assert.deepEqual(footprintPointOf(atlantaToTroutman("buyer")), {
      city: "Atlanta",
      state: "GA",
    });
  });

  test("a missing city or state is not a point", () => {
    assert.equal(
      footprintPointOf({ customer_end: "shipper", origin_city: "Atlanta", origin_state: null }),
      null,
    );
    assert.equal(
      footprintPointOf({ customer_end: "shipper", origin_city: "   ", origin_state: "GA" }),
      null,
    );
    assert.equal(
      footprintPointOf({ customer_end: "receiver", destination_city: "Troutman" }),
      null,
    );
  });

  test("whitespace around a real place is trimmed, not rejected", () => {
    assert.deepEqual(
      footprintPointOf({ customer_end: "receiver", destination_city: " Troutman ", destination_state: " NC " }),
      { city: "Troutman", state: "NC" },
    );
  });

  test("no load at all → null", () => {
    assert.equal(footprintPointOf(null), null);
    assert.equal(footprintPointOf(undefined), null);
    assert.equal(footprintPointOf({}), null);
  });
});
