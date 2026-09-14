import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { canonicalVendorName } from "./vendorNames.js";

const ROLODEX = [
  { name: "Ray's Tire Service", aliases: ["Rays Tire Shop", "  RAYS TIRE  "] },
  { name: "TA Petro", aliases: [] },
  { name: "Thermo King", aliases: null },
];

describe("canonicalVendorName — the one spelling a vendor name has", () => {
  test("a name match in another case becomes the vendor's own spelling", () => {
    assert.equal(canonicalVendorName("ta petro", ROLODEX), "TA Petro");
    assert.equal(canonicalVendorName("THERMO KING", ROLODEX), "Thermo King");
    assert.equal(
      canonicalVendorName("  ray's tire service  ", ROLODEX),
      "Ray's Tire Service",
    );
  });

  test("an alias match becomes the vendor's NAME, not the alias", () => {
    assert.equal(
      canonicalVendorName("Rays Tire Shop", ROLODEX),
      "Ray's Tire Service",
    );
    assert.equal(
      canonicalVendorName("rays tire", ROLODEX),
      "Ray's Tire Service",
      "the stored alias is trimmed on the way in too",
    );
  });

  test("no match is kept as typed, trimmed", () => {
    assert.equal(canonicalVendorName("  Cummins Atlantic ", ROLODEX), "Cummins Atlantic");
    assert.equal(canonicalVendorName("Cummins Atlantic", []), "Cummins Atlantic");
  });

  test("blank, whitespace and non-strings are null — nobody typed a vendor", () => {
    for (const bad of ["", "   ", null, undefined, 7, ["TA"]])
      assert.equal(canonicalVendorName(bad, ROLODEX), null, String(bad));
  });

  test("an alias that is a PREFIX of a name does not match — exact key only", () => {
    const rolodex = [{ name: "TA Petro", aliases: ["TA Travel Center"] }];
    assert.equal(canonicalVendorName("TA", rolodex), "TA");
    assert.equal(canonicalVendorName("TA Pet", rolodex), "TA Pet");
    assert.equal(canonicalVendorName("TA Petro Inc", rolodex), "TA Petro Inc");
  });

  test("the first vendor that owns the key wins, and a missing vendor row is skipped", () => {
    const rolodex = [null, { aliases: ["TA"] }, { name: "TA Petro", aliases: ["ta"] }];
    assert.equal(canonicalVendorName("TA", rolodex), "TA Petro");
  });
});
