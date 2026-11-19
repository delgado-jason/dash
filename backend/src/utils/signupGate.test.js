import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { signupOpen, SIGNUP_CLOSED } from "./signupGate.js";

describe("signupOpen — the front door", () => {
  test("a dash with users and no flag is closed — the prod case", () => {
    assert.equal(signupOpen({ allowSignup: undefined, userCount: 2 }), false);
    assert.equal(signupOpen({ allowSignup: "", userCount: 2 }), false);
  });

  test("an empty dash is open, so the first owner can be made", () => {
    assert.equal(signupOpen({ allowSignup: undefined, userCount: 0 }), true);
  });

  test("only the word true opens it; look-alikes stay closed", () => {
    assert.equal(signupOpen({ allowSignup: "true", userCount: 5 }), true);
    for (const notTrue of ["1", "yes", "True", "TRUE", " true", "on"]) {
      assert.equal(signupOpen({ allowSignup: notTrue, userCount: 5 }), false, notTrue);
    }
  });

  test("a count that isn't a count is closed, never open", () => {
    assert.equal(signupOpen({ allowSignup: undefined, userCount: undefined }), false);
    assert.equal(signupOpen({ allowSignup: undefined, userCount: NaN }), false);
    assert.equal(signupOpen({ allowSignup: undefined, userCount: "0" }), false);
  });

  test("the closed sentence names the real door", () => {
    assert.match(SIGNUP_CLOSED, /Settings → Team/);
  });
});
