import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ALIAS_MAX,
  nameKey,
  validateVendorName,
} from "./vendorValidation.js";

describe("validateVendorName — the name every bridge body carries", () => {
  test("a real name passes, ends trimmed or not", () => {
    assert.deepEqual(validateVendorName("Ray's Tire Service"), []);
    assert.deepEqual(validateVendorName("  TA Petro  "), []);
  });

  test("blank and whitespace-only are refused", () => {
    assert.deepEqual(validateVendorName(""), ["name cannot be blank"]);
    assert.deepEqual(validateVendorName("   "), ["name cannot be blank"]);
    assert.deepEqual(validateVendorName("\t\n "), ["name cannot be blank"]);
  });

  test("a non-string is refused before anything else is asked of it", () => {
    for (const bad of [null, undefined, 7, ["TA"], {}, true])
      assert.deepEqual(
        validateVendorName(bad),
        ["name must be a string"],
        String(bad),
      );
  });

  test("120 characters is accepted, 121 is not — vendors.name is VARCHAR(120)", () => {
    assert.equal(ALIAS_MAX, 120);
    assert.deepEqual(validateVendorName("x".repeat(120)), []);
    assert.deepEqual(validateVendorName("x".repeat(121)), [
      "name must be 120 characters or fewer",
    ]);
  });

  test("the length is measured AFTER trimming — padding is not the name", () => {
    assert.deepEqual(validateVendorName(`  ${"x".repeat(120)}  `), []);
  });

  test("the label names the field it was called for", () => {
    assert.deepEqual(validateVendorName("", "alias"), ["alias cannot be blank"]);
    assert.deepEqual(validateVendorName(4, "alias"), ["alias must be a string"]);
  });
});

describe("nameKey — the same key the DB generates", () => {
  test("trims the ends and lowercases", () => {
    assert.equal(nameKey("  TA Petro  "), "ta petro");
    assert.equal(nameKey("THERMO KING"), "thermo king");
  });

  test("inner spaces are KEPT — lower(btrim(x)) collapses nothing", () => {
    assert.equal(nameKey("Thermo  King"), "thermo  king");
    assert.notEqual(nameKey("Thermo  King"), nameKey("Thermo King"));
  });

  test("apostrophes and punctuation are kept — the key is not a fuzzy match", () => {
    assert.equal(nameKey("Ray's Tire Service"), "ray's tire service");
    assert.notEqual(nameKey("Rays Tire Service"), nameKey("Ray's Tire Service"));
  });

  test("an already-clean key is its own key", () => {
    assert.equal(nameKey("ta petro"), "ta petro");
  });
});

describe("nameKey — parity with btrim, which strips ASCII spaces only", () => {
  test("a trailing NBSP or tab is KEPT, exactly as lower(btrim(name)) keeps it", () => {
    // JS trim() would strip these; the DB's key would not — and then a One-off
    // or a Merge sent from the app would miss the row SQL grouped.
    assert.equal(nameKey("TA Petro "), "ta petro ");
    assert.equal(nameKey("\tTA\t"), "\tta\t");
    assert.equal(nameKey("  TA Petro   "), "ta petro ");
  });
});
