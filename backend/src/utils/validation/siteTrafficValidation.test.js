import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  WINDOWS,
  DEFAULT_WINDOW,
  parseWindow,
} from "./siteTrafficValidation.js";

describe("parseWindow — the only thing /site-traffic reads from the client", () => {
  test("every key in the map comes back with its own day count", () => {
    assert.deepEqual(parseWindow("7d"), { key: "7d", days: 7 });
    assert.deepEqual(parseWindow("30d"), { key: "30d", days: 30 });
    assert.deepEqual(parseWindow("90d"), { key: "90d", days: 90 });
    assert.deepEqual(parseWindow("12m"), { key: "12m", days: 365 });
  });

  test("the keys and the default never drift apart", () => {
    assert.deepEqual(Object.keys(WINDOWS), ["7d", "30d", "90d", "12m"]);
    assert.equal(DEFAULT_WINDOW, "30d");
    assert.equal(WINDOWS[DEFAULT_WINDOW], 30);
  });

  test("not asking gets the default — no ?window=, or an empty one", () => {
    const fallback = { key: "30d", days: 30 };
    assert.deepEqual(parseWindow(undefined), fallback);
    assert.deepEqual(parseWindow(null), fallback);
    assert.deepEqual(parseWindow(""), fallback);
  });

  test("junk is a 400, not a quiet fallback", () => {
    for (const bad of ["7", "7D", "1y", "all", "30days", " 30d", "30d "]) {
      assert.throws(
        () => parseWindow(bad),
        (err) => err.type === "validation" && err.statusCode === 400,
        JSON.stringify(bad),
      );
    }
  });

  test("a number is refused — the map is keyed by string, not by day count", () => {
    for (const bad of [7, 30, 0, NaN]) {
      assert.throws(() => parseWindow(bad), { name: "ValidationError" }, String(bad));
    }
  });

  test("a repeated ?window= is an array, and an array is refused", () => {
    assert.throws(() => parseWindow(["7d", "30d"]), { name: "ValidationError" });
    // An array of one stringifies to a valid key — the typeof gate has to
    // catch it BEFORE the lookup, or ?window[]=7d would sneak through.
    assert.throws(() => parseWindow(["7d"]), { name: "ValidationError" });
  });

  test("an object is refused, inherited property names included", () => {
    assert.throws(() => parseWindow({ "7d": 1 }), { name: "ValidationError" });
    assert.throws(() => parseWindow("constructor"), { name: "ValidationError" });
    assert.throws(() => parseWindow("toString"), { name: "ValidationError" });
  });

  test("the message names what IS allowed", () => {
    assert.throws(() => parseWindow("nope"), /7d, 30d, 90d, 12m/);
  });
});
