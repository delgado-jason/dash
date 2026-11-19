import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  passwordErrors,
  assertPassword,
  PASSWORD_MIN,
  PASSWORD_MAX,
} from "./passwordValidation.js";

describe("passwordErrors — the one rule for a new password", () => {
  test("ten characters pass; nine do not", () => {
    assert.deepEqual(passwordErrors("a".repeat(PASSWORD_MIN)), []);
    assert.deepEqual(passwordErrors("a".repeat(PASSWORD_MIN - 1)), [
      "A password needs at least 10 characters.",
    ]);
  });

  test("missing, empty or not a string is 'required', not 'too short'", () => {
    for (const bad of [undefined, null, "", 7, {}, []]) {
      assert.deepEqual(passwordErrors(bad), ["A password is required."], String(bad));
    }
  });

  test("the bcrypt ceiling is 72 BYTES — a long password is refused, not truncated", () => {
    assert.deepEqual(passwordErrors("a".repeat(PASSWORD_MAX)), []);
    assert.deepEqual(passwordErrors("a".repeat(PASSWORD_MAX + 1)), [
      "A password can be at most 72 characters.",
    ]);
    // 36 two-byte characters are 72 bytes; 37 are over.
    assert.deepEqual(passwordErrors("é".repeat(36)), []);
    assert.equal(passwordErrors("é".repeat(37)).length, 1);
  });

  test("no composition rule: all lowercase, all digits, spaces inside — all fine", () => {
    assert.deepEqual(passwordErrors("correcthorsebattery"), []);
    assert.deepEqual(passwordErrors("0123456789"), []);
    assert.deepEqual(passwordErrors("the truck is blue"), []);
  });
});

describe("assertPassword — the 400 the route sends", () => {
  test("throws a validation error carrying the first sentence", () => {
    assert.throws(
      () => assertPassword("short"),
      (err) =>
        err.type === "validation" &&
        err.statusCode === 400 &&
        err.message === "A password needs at least 10 characters.",
    );
  });

  test("a good password passes silently", () => {
    assert.doesNotThrow(() => assertPassword("long enough now"));
  });
});
