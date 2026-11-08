import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { accessorialRateWarning } from "./accessorialValidation.js";

describe("accessorialRateWarning — accepted, but say what it is paid at", () => {
  test("a type with no rate row names the fallback", () => {
    assert.equal(
      accessorialRateWarning("Job-Site Delivery", false, "0.73"),
      "Job-Site Delivery has no pay rate — it is paid at the 73% fallback; set it in Settings",
    );
    assert.match(accessorialRateWarning("X", false, 1), /the 100% fallback/);
  });
  test("a rated type carries no warning", () => assert.equal(accessorialRateWarning("Tarp", true, 0.73), null));
  test("an unreadable fallback says nothing rather than lie", () => assert.equal(accessorialRateWarning("X", false, undefined), null));
});
