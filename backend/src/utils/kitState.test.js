import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { kitStateToStatus } from "./kitState.js";

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
