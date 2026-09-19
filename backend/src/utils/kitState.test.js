import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { kitStateToStatus, kitCreatePayload, isDoubleOptIn } from "./kitState.js";

describe("kitStateToStatus — what Kit's word for a reader means to the list", () => {
  test("active is a confirmed subscriber", () => {
    assert.equal(kitStateToStatus("active"), "confirmed");
    assert.equal(kitStateToStatus(" Active "), "confirmed");
  });

  test("cancelled, bounced and complained all mean stop", () => {
    for (const s of ["cancelled", "bounced", "complained"]) {
      assert.equal(kitStateToStatus(s), "unsubscribed", s);
    }
  });

  test("inactive (mailed, not yet clicked) changes nothing", () => {
    assert.equal(kitStateToStatus("inactive"), null);
  });

  test("an unknown state, a non-string or nothing at all changes nothing", () => {
    for (const s of ["paused", "", null, undefined, 7, {}]) {
      assert.equal(kitStateToStatus(s), null, String(s));
    }
  });
});

describe("kitCreatePayload — what dash asks Kit to create", () => {
  test("single opt-in: the address only, Kit's default makes it active", () => {
    assert.deepEqual(kitCreatePayload("a@example.com", false), { email_address: "a@example.com" });
  });

  test("double opt-in: created inactive so the form's confirmation email decides", () => {
    assert.deepEqual(kitCreatePayload("a@example.com", true), {
      email_address: "a@example.com",
      state: "inactive",
    });
  });

  test("the switch is exactly KIT_DOUBLE_OPT_IN=1", () => {
    assert.equal(isDoubleOptIn({}), false);
    assert.equal(isDoubleOptIn({ KIT_DOUBLE_OPT_IN: "" }), false);
    assert.equal(isDoubleOptIn({ KIT_DOUBLE_OPT_IN: "true" }), false);
    assert.equal(isDoubleOptIn({ KIT_DOUBLE_OPT_IN: "1" }), true);
  });
});
