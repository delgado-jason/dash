import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  HOLD_PREFIX,
  REASON_MAX,
  holdReason,
  validateTierHistoryQuery,
  validateTierHold,
} from "./agentTierHistoryValidation.js";

describe("validateTierHistoryQuery — the two optional filters", () => {
  test("no filters, empty filters and a missing query all pass", () => {
    assert.deepEqual(validateTierHistoryQuery({}), []);
    assert.deepEqual(validateTierHistoryQuery(undefined), []);
    assert.deepEqual(validateTierHistoryQuery({ since: "", agent_id: "" }), []);
  });

  test("since is a bare day key — never a timestamp or a US date", () => {
    assert.deepEqual(validateTierHistoryQuery({ since: "2026-09-01" }), []);
    for (const bad of ["2026-09-01T00:00:00Z", "09/01/2026", "2026-13-01", "2026-02-30", "yesterday"]) {
      assert.deepEqual(validateTierHistoryQuery({ since: bad }), ["since must be a YYYY-MM-DD date"], bad);
    }
  });

  test("agent_id must be a UUID when given", () => {
    assert.deepEqual(validateTierHistoryQuery({ agent_id: "3f6b2c1e-9c2b-4d0e-8a2f-1b2c3d4e5f60" }), []);
    assert.deepEqual(validateTierHistoryQuery({ agent_id: "not-a-uuid" }), ["agent_id must be a UUID"]);
  });

  test("a repeated query param arrives as an ARRAY and is refused, never coerced", () => {
    // ?since=2026-09-01&since=2026-09-02 — express hands the array straight
    // through, and String(["2026-09-01"]) would look like a valid day key.
    assert.deepEqual(validateTierHistoryQuery({ since: ["2026-09-01"] }), ["since must be a YYYY-MM-DD date"]);
    assert.deepEqual(validateTierHistoryQuery({ since: ["2026-09-01", "2026-09-02"] }), ["since must be a YYYY-MM-DD date"]);
    assert.deepEqual(validateTierHistoryQuery({ agent_id: ["3f6b2c1e-9c2b-4d0e-8a2f-1b2c3d4e5f60"] }), ["agent_id must be a UUID"]);
  });

  test("every error is reported, not just the first", () => {
    assert.equal(validateTierHistoryQuery({ since: "x", agent_id: "y" }).length, 2);
  });
});

describe("validateTierHold — the owner's hold on a suggestion", () => {
  test("a reason is the whole body", () => {
    assert.deepEqual(validateTierHold({ reason: "hold — $6.94 all-in on 3 loads · above Strong" }), []);
    assert.deepEqual(validateTierHold({ reason: "$6.94 all-in on 3 loads · above Strong" }), []);
  });

  test("a missing, blank or non-string reason is refused by name", () => {
    const msg = "A hold needs a reason — the evidence it sets aside.";
    assert.deepEqual(validateTierHold({}), [msg]);
    assert.deepEqual(validateTierHold(undefined), [msg]);
    assert.deepEqual(validateTierHold({ reason: "   " }), [msg]);
    assert.deepEqual(validateTierHold({ reason: 42 }), [msg]);
  });

  test("nothing but the reason may ride along — no tier, no source, no actor", () => {
    assert.deepEqual(validateTierHold({ reason: "x", to_tier: 1 }), ["to_tier not allowed"]);
    assert.deepEqual(validateTierHold({ reason: "x", source: "dash", changed_by: "me" }), [
      "source not allowed",
      "changed_by not allowed",
    ]);
  });

  test("the stored reason is capped, prefix included", () => {
    const fits = "x".repeat(REASON_MAX - HOLD_PREFIX.length);
    assert.deepEqual(validateTierHold({ reason: fits }), []);
    assert.deepEqual(validateTierHold({ reason: `${fits}x` }), [`reason cannot be more than ${REASON_MAX} characters`]);
  });
});

describe("holdReason — the prefix the suppression reads", () => {
  test("adds the prefix to bare evidence and keeps it when already there", () => {
    assert.equal(holdReason("$6.94 all-in on 3 loads · above Strong"), "hold — $6.94 all-in on 3 loads · above Strong");
    assert.equal(holdReason("hold — $6.94 all-in on 3 loads · above Strong"), "hold — $6.94 all-in on 3 loads · above Strong");
  });

  test("trims, so a trailing space can't defeat a later string compare", () => {
    assert.equal(holdReason("  hold — evidence  "), "hold — evidence");
  });

  test("the prefix test is case-insensitive — the reader's is too, so nothing is prefixed twice", () => {
    assert.equal(holdReason("Hold — evidence"), "Hold — evidence");
    assert.equal(holdReason("HOLD — evidence"), "HOLD — evidence");
    assert.equal(holdReason("Holding at Tier 2"), `${HOLD_PREFIX}Holding at Tier 2`); // not the prefix — a sentence
  });
});
