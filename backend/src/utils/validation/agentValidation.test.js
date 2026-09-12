import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizeAgentText, validateAgentPatch } from "./agentValidation.js";

describe("validateAgentPatch agent_city", () => {
  test("skips when falsy — null clears the column, blank is a no-op", () => {
    assert.deepEqual(validateAgentPatch({ agent_city: null }), []);
    assert.deepEqual(validateAgentPatch({ agent_city: "" }), []);
    assert.deepEqual(validateAgentPatch({ agent_city: undefined }), []);
  });

  test("accepts a real city", () => {
    assert.deepEqual(validateAgentPatch({ agent_city: "Tulsa" }), []);
    assert.deepEqual(validateAgentPatch({ agent_city: "c".repeat(100) }), []);
  });

  test("rejects a non-string", () => {
    const errors = validateAgentPatch({ agent_city: 42 });
    assert.deepEqual(errors, ["agent_city must be a string"]);
  });

  test("rejects more than 100 characters", () => {
    const errors = validateAgentPatch({ agent_city: "c".repeat(101) });
    assert.deepEqual(errors, ["agent_city cannot be more than 100 characters"]);
  });
});

describe("validateAgentPatch agent_state", () => {
  test("skips when falsy — null clears the column, blank is a no-op", () => {
    assert.deepEqual(validateAgentPatch({ agent_state: null }), []);
    assert.deepEqual(validateAgentPatch({ agent_state: "" }), []);
    assert.deepEqual(validateAgentPatch({ agent_state: undefined }), []);
  });

  test("accepts a 2-letter code in either case, tolerating whitespace", () => {
    // The service runs normalizeAgentText first, so what the rule tolerates
    // here is what the varchar(2) column actually receives.
    assert.deepEqual(validateAgentPatch({ agent_state: "OK" }), []);
    assert.deepEqual(validateAgentPatch({ agent_state: "tx" }), []);
    assert.deepEqual(validateAgentPatch({ agent_state: " OK " }), []);
  });

  test("rejects a non-string", () => {
    assert.deepEqual(validateAgentPatch({ agent_state: 12 }), [
      "agent_state must be a string",
    ]);
  });

  test("rejects anything but exactly two letters", () => {
    for (const bad of ["Oklahoma", "O", "O1", "OKL"]) {
      assert.deepEqual(
        validateAgentPatch({ agent_state: bad }),
        ["agent_state must be a 2-letter state code"],
        bad,
      );
    }
  });
});

describe("validateAgentPatch length caps", () => {
  test("first_name and last_name stop at 50 characters", () => {
    assert.deepEqual(validateAgentPatch({ first_name: "x".repeat(50) }), []);
    assert.deepEqual(validateAgentPatch({ first_name: "x".repeat(51) }), [
      "first_name cannot be more than 50 characters",
    ]);
    assert.deepEqual(validateAgentPatch({ last_name: "x".repeat(51) }), [
      "last_name cannot be more than 50 characters",
    ]);
  });

  test("a blank name is still refused — the cap doesn't loosen the old rule", () => {
    assert.deepEqual(validateAgentPatch({ first_name: "   " }), [
      "first_name cannot be blank",
    ]);
  });

  test("phone stops at 50 characters and still skips when null", () => {
    assert.deepEqual(validateAgentPatch({ phone: null }), []);
    assert.deepEqual(validateAgentPatch({ phone: "(918) 555-0100" }), []);
    assert.deepEqual(validateAgentPatch({ phone: "9".repeat(51) }), [
      "phone cannot be more than 50 characters",
    ]);
  });

  test("email stops at 50 characters on top of the shape check", () => {
    assert.deepEqual(validateAgentPatch({ email: null }), []);
    assert.deepEqual(validateAgentPatch({ email: "dana@ewt.com" }), []);
    assert.deepEqual(validateAgentPatch({ email: `${"x".repeat(45)}@a.com` }), [
      "email cannot be more than 50 characters",
    ]);
  });

  test("a clean identity patch passes as a whole", () => {
    const patch = {
      first_name: "Dana",
      last_name: "Ruiz",
      phone: "(918) 555-0100",
      email: "dana@ewt.com",
      preferred_contact: "text",
      agent_city: "Tulsa",
      agent_state: "OK",
    };
    assert.deepEqual(validateAgentPatch(patch), []);
  });
});

describe("normalizeAgentText", () => {
  test("trims the text fields and uppercases the state code in place", () => {
    const data = {
      first_name: " Dana ",
      last_name: "Ruiz  ",
      phone: " (918) 555-0100",
      email: " dana@ewt.com ",
      agent_city: "  Tulsa ",
      agent_state: " ok ",
    };
    const out = normalizeAgentText(data);
    assert.equal(out, data);
    assert.deepEqual(data, {
      first_name: "Dana",
      last_name: "Ruiz",
      phone: "(918) 555-0100",
      email: "dana@ewt.com",
      agent_city: "Tulsa",
      agent_state: "OK",
    });
  });

  test("leaves null, undefined and non-strings for the rules to judge", () => {
    const data = { phone: null, agent_city: undefined, agent_state: 12, rating: 4 };
    normalizeAgentText(data);
    assert.deepEqual(data, { phone: null, agent_city: undefined, agent_state: 12, rating: 4 });
    assert.deepEqual(normalizeAgentText({}), {});
  });

  test("what passes the rules after trimming is exactly what the column gets", () => {
    // Every case here would clear validation on its own yet overflow the
    // varchar it is bound for — the normalizer is what closes that gap.
    const data = {
      first_name: ` ${"x".repeat(50)}`,
      agent_city: `  ${"c".repeat(100)}`,
      agent_state: " OK ",
    };
    assert.deepEqual(validateAgentPatch(data), []);
    normalizeAgentText(data);
    assert.equal(data.first_name.length, 50);
    assert.equal(data.agent_city.length, 100);
    assert.equal(data.agent_state, "OK");
    assert.deepEqual(validateAgentPatch(data), []);
  });

  test("a whitespace-only name still dies at the blank rule after trimming", () => {
    const data = { first_name: "   " };
    normalizeAgentText(data);
    assert.deepEqual(validateAgentPatch(data), ["first_name cannot be blank"]);
  });
});
