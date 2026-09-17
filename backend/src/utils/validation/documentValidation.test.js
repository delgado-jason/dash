import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { LOAD_NUMBER_MAX, validateLoadNumber } from "./documentValidation.js";

describe("validateLoadNumber — the key the DTS server speaks", () => {
  test("a Landstar seven-digit number passes, trimmed or not", () => {
    assert.deepEqual(validateLoadNumber("8443747"), []);
    assert.deepEqual(validateLoadNumber("  8443747 "), []);
  });

  test("blank and whitespace-only are refused", () => {
    assert.deepEqual(validateLoadNumber(""), ["load_number cannot be blank"]);
    assert.deepEqual(validateLoadNumber("   "), ["load_number cannot be blank"]);
  });

  test("a non-string is refused before anything else is asked of it", () => {
    for (const bad of [null, undefined, 8443747, ["8443747"], {}])
      assert.deepEqual(validateLoadNumber(bad), ["load_number must be a string"], String(bad));
  });

  test("twenty characters is accepted, twenty-one is not", () => {
    assert.deepEqual(validateLoadNumber("x".repeat(LOAD_NUMBER_MAX)), []);
    assert.deepEqual(validateLoadNumber("x".repeat(LOAD_NUMBER_MAX + 1)),
      [`load_number must be ${LOAD_NUMBER_MAX} characters or fewer`]);
  });
});
