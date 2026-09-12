import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  CONTACT_TYPES,
  validateAgentContactCreate,
  validateAgentContactPatch,
} from "./agentContactValidation.js";

const base = {
  agent_id: "3f6b2c1e-9c2b-4d0e-8a2f-1b2c3d4e5f60",
  direction: "outbound",
  method: "call",
  type: "capacity",
};

describe("validateAgentContactCreate — identity of the touch", () => {
  test("the minimal v1 touch still passes", () => {
    assert.deepEqual(validateAgentContactCreate(base), []);
  });

  test("every v2 type is accepted, including the retired v1 ones", () => {
    for (const type of CONTACT_TYPES) {
      assert.deepEqual(validateAgentContactCreate({ ...base, type }), [], type);
    }
    for (const t of ["milestone", "holiday", "reactivation", "owner_personal", "load_in_progress", "freight_bill"]) {
      assert.ok(CONTACT_TYPES.includes(t), `${t} missing from the registry`);
    }
  });

  test("an unknown type, direction or method is refused by name", () => {
    assert.match(validateAgentContactCreate({ ...base, type: "reply" })[0], /^type must be one of/);
    assert.deepEqual(validateAgentContactCreate({ ...base, direction: "sideways" }), [
      "direction must be outbound or inbound",
    ]);
    assert.deepEqual(validateAgentContactCreate({ ...base, method: "fax" }), [
      "method must be call, email, or text",
    ]);
    assert.deepEqual(validateAgentContactCreate({ ...base, agent_id: undefined }), [
      "agent_id is required",
    ]);
  });
});

describe("validateAgentContactCreate — the v2 fields", () => {
  test("outcome and next_step take their enums, null clears them", () => {
    for (const outcome of ["reached", "voicemail", "no_answer", "bad_number", null]) {
      assert.deepEqual(validateAgentContactCreate({ ...base, outcome }), [], String(outcome));
    }
    assert.match(validateAgentContactCreate({ ...base, outcome: "hung_up" })[0], /^outcome must be one of/);
    for (const next_step of ["call_back", "on_their_list", "send_capacity", "none", null]) {
      assert.deepEqual(validateAgentContactCreate({ ...base, next_step }), [], String(next_step));
    }
    assert.match(validateAgentContactCreate({ ...base, next_step: "later" })[0], /^next_step must be one of/);
  });

  test("next_step_at is a bare YYYY-MM-DD day key — never a timestamp", () => {
    assert.deepEqual(validateAgentContactCreate({ ...base, next_step_at: "2026-09-17" }), []);
    assert.deepEqual(validateAgentContactCreate({ ...base, next_step_at: null }), []);
    for (const bad of ["2026-09-17T00:00:00Z", "09/17/2026", "2026-13-01", "2026-02-30", 20260917]) {
      assert.deepEqual(
        validateAgentContactCreate({ ...base, next_step_at: bad }),
        ["next_step_at must be a YYYY-MM-DD date"],
        String(bad),
      );
    }
  });

  test("footprint_captured and cap_override are booleans", () => {
    assert.deepEqual(validateAgentContactCreate({ ...base, footprint_captured: true, cap_override: false }), []);
    assert.deepEqual(validateAgentContactCreate({ ...base, footprint_captured: "yes" }), [
      "footprint_captured must be true or false",
    ]);
    assert.deepEqual(validateAgentContactCreate({ ...base, cap_override: 1 }), [
      "cap_override must be true or false",
    ]);
  });

  test("combined_types is an array of contact types; empty is fine", () => {
    assert.deepEqual(validateAgentContactCreate({ ...base, combined_types: ["milestone", "holiday"] }), []);
    assert.deepEqual(validateAgentContactCreate({ ...base, combined_types: [] }), []);
    assert.deepEqual(validateAgentContactCreate({ ...base, combined_types: "milestone" }), [
      "combined_types must be an array",
    ]);
    assert.match(validateAgentContactCreate({ ...base, combined_types: ["milestone", "party"] })[0], /^combined_types must be contact types/);
  });

  test("outcome is a call's fact — an email or a text can't carry one", () => {
    assert.deepEqual(validateAgentContactCreate({ ...base, method: "call", outcome: "reached" }), []);
    for (const method of ["email", "text"]) {
      assert.deepEqual(
        validateAgentContactCreate({ ...base, method, outcome: "reached" }),
        ["outcome only applies to a call"],
        method,
      );
      // null is "no outcome" and is fine on any method
      assert.deepEqual(validateAgentContactCreate({ ...base, method, outcome: null }), [], `${method} null`);
    }
  });

  test("contacted_at, note and load_id keep their v1 rules", () => {
    assert.deepEqual(validateAgentContactCreate({ ...base, contacted_at: "2026-09-12T10:00:00Z", note: "left the number" }), []);
    assert.deepEqual(validateAgentContactCreate({ ...base, contacted_at: "yesterday" }), [
      "contacted_at must be a valid timestamp",
    ]);
    assert.deepEqual(validateAgentContactCreate({ ...base, load_id: "not-a-uuid" }), ["load_id must be a UUID"]);
    assert.deepEqual(validateAgentContactCreate({ ...base, load_id: null }), []);
  });

  test("note must be a string — null clears it, anything else is refused by name", () => {
    assert.deepEqual(validateAgentContactCreate({ ...base, note: null }), []);
    for (const bad of [42, true, ["left the number"], { text: "x" }]) {
      assert.deepEqual(validateAgentContactCreate({ ...base, note: bad }), ["note must be a string"], String(bad));
    }
    assert.deepEqual(validateAgentContactPatch({ note: 42 }), ["note must be a string"]);
  });

  test("every error is reported, not just the first", () => {
    const errors = validateAgentContactCreate({ ...base, outcome: "x", next_step: "y" });
    assert.equal(errors.length, 2);
  });
});

describe("validateAgentContactPatch — the fold and the follow-up", () => {
  test("combined_types alone is the fold", () => {
    assert.deepEqual(validateAgentContactPatch({ combined_types: ["milestone"] }), []);
  });

  test("the follow-up fields patch together", () => {
    assert.deepEqual(
      validateAgentContactPatch({ next_step: "call_back", next_step_at: "2026-09-24", note: "asked for Thursday", outcome: "reached", footprint_captured: true }),
      [],
    );
  });

  test("the touch's identity can never be rewritten", () => {
    for (const field of ["agent_id", "direction", "method", "type", "contacted_at", "cap_override"]) {
      assert.deepEqual(validateAgentContactPatch({ [field]: "x" }), [`${field} not allowed`], field);
    }
  });

  test("an empty patch is refused", () => {
    assert.deepEqual(validateAgentContactPatch({}), ["No valid fields provided for update"]);
    assert.deepEqual(validateAgentContactPatch(undefined), ["No valid fields provided for update"]);
  });

  test("a bad value inside an allowed field is still caught", () => {
    assert.deepEqual(validateAgentContactPatch({ next_step_at: "next week" }), [
      "next_step_at must be a YYYY-MM-DD date",
    ]);
  });
});
