import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAgentText,
  validateAgentPatch,
  validateAgentCreate,
  tierChangeGate,
} from "./agentValidation.js";

describe("agency_id — optional since 073", () => {
  test("null and undefined pass; a blank code is a person with no agency yet", () => {
    assert.deepEqual(validateAgentPatch({ agency_id: null }), []);
    assert.deepEqual(validateAgentPatch({ agency_id: undefined }), []);
  });

  test("a real UUID passes, anything else is refused without throwing", () => {
    assert.deepEqual(validateAgentPatch({ agency_id: "3f6b2c1e-9c2b-4d0e-8a2f-1b2c3d4e5f60" }), []);
    // The sentence names the field: a payload can carry two uuids, and
    // "not a valid UUID" alone never said which one was wrong.
    assert.deepEqual(validateAgentPatch({ agency_id: "EWT" }), ["agency_id is not a valid UUID"]);
    assert.deepEqual(validateAgentPatch({ agency_id: 42 }), ["agency_id is not a valid UUID"]);
  });

  test("create no longer requires a code — only the person's name", () => {
    assert.deepEqual(validateAgentCreate({ first_name: "Dana", last_name: "Ruiz" }), []);
    assert.deepEqual(validateAgentCreate({ first_name: "Dana", last_name: "Ruiz", agency_id: null }), []);
    assert.deepEqual(validateAgentCreate({ last_name: "Ruiz" }), ["Missing first_name"]);
  });

  test("create refuses an agency_id that is not a UUID, by name", () => {
    assert.deepEqual(
      validateAgentCreate({ first_name: "Dana", last_name: "Ruiz", agency_id: "CPL" }),
      ["agency_id is not a valid UUID"],
    );
  });
});

describe("posting_code — the agent's own code on the bill", () => {
  test("null and undefined pass: they post from the agency's desk", () => {
    assert.deepEqual(validateAgentPatch({ posting_code: null }), []);
    assert.deepEqual(validateAgentPatch({ posting_code: undefined }), []);
  });

  test("three letters is the only shape — two or four is refused", () => {
    assert.deepEqual(validateAgentPatch({ posting_code: "MAM" }), []);
    for (const bad of ["MA", "MAMA", "M1M"]) {
      assert.deepEqual(
        validateAgentPatch({ posting_code: bad }),
        ["posting_code must be 3 uppercase letters"],
        bad,
      );
    }
    assert.deepEqual(validateAgentPatch({ posting_code: 42 }), ["posting_code must be a string"]);
  });

  // The service normalizes before it validates, so this is what a person
  // typing "mam" actually gets: the stored code, not a 400.
  test("case and padding are normalized, never refused — ' mam ' is stored MAM", () => {
    const data = normalizeAgentText({ posting_code: " mam " });
    assert.equal(data.posting_code, "MAM");
    assert.deepEqual(validateAgentPatch(data), []);

    const created = normalizeAgentText({ first_name: "Eric", last_name: "Hesketh", posting_code: "mam" });
    assert.equal(created.posting_code, "MAM");
    assert.deepEqual(validateAgentCreate(created), []);
  });

  test("blank is not a code — it clears back to the agency's desk (null)", () => {
    const data = normalizeAgentText({ posting_code: "   " });
    assert.equal(data.posting_code, null);
    assert.deepEqual(validateAgentPatch(data), []);
  });

  test("create takes one, and is just as happy without", () => {
    assert.deepEqual(
      validateAgentCreate({ first_name: "Eric", last_name: "Hesketh", posting_code: "MAM" }),
      [],
    );
    assert.deepEqual(
      validateAgentCreate({ first_name: "Rich", last_name: "Stewart", posting_code: null }),
      [],
    );
  });
});

describe("relationship_tier — 1, 2, 3 or no tier", () => {
  test("null clears the tier (a Prospect); 1–3 are the owner's tiers", () => {
    assert.deepEqual(validateAgentPatch({ relationship_tier: null }), []);
    for (const t of [1, 2, 3]) assert.deepEqual(validateAgentPatch({ relationship_tier: t }), [], String(t));
    assert.deepEqual(validateAgentCreate({ first_name: "D", last_name: "R", relationship_tier: null }), []);
  });

  test("create never takes a tier — even a valid one is the side door around the owner's gate", () => {
    for (const t of [1, 2, 3, 7]) {
      assert.deepEqual(
        validateAgentCreate({ first_name: "D", last_name: "R", relationship_tier: t }),
        ["a new agent has no tier — the owner sets one from the book"],
        String(t),
      );
    }
    assert.deepEqual(validateAgentCreate({ first_name: "D", last_name: "R" }), []);
  });

  test("anything outside 1–3, or not an integer, is refused", () => {
    for (const bad of [0, 4, 2.5, "2", "one"]) {
      assert.deepEqual(
        validateAgentPatch({ relationship_tier: bad }),
        ["relationship_tier must be 1, 2, 3, or null"],
        String(bad),
      );
    }
  });
});

describe("best_time_to_call", () => {
  test("null clears it; a short note passes; blank normalizes to null", () => {
    assert.deepEqual(validateAgentPatch({ best_time_to_call: null }), []);
    assert.deepEqual(validateAgentPatch({ best_time_to_call: "mornings before 10" }), []);
    const data = { best_time_to_call: "   " };
    normalizeAgentText(data);
    assert.equal(data.best_time_to_call, null);
    const trimmed = { best_time_to_call: "  after lunch " };
    normalizeAgentText(trimmed);
    assert.equal(trimmed.best_time_to_call, "after lunch");
  });

  test("a non-string or an essay is refused", () => {
    assert.deepEqual(validateAgentPatch({ best_time_to_call: 10 }), ["best_time_to_call must be a string"]);
    assert.deepEqual(validateAgentPatch({ best_time_to_call: "x".repeat(81) }), [
      "best_time_to_call cannot be more than 80 characters",
    ]);
  });
});

describe("tierChangeGate — the owner sets tiers, with a reason", () => {
  test("no tier in the patch → nothing to gate", () => {
    assert.deepEqual(tierChangeGate({ from: 2, to: undefined, reason: undefined, role: "dispatcher" }), {
      changed: false,
      error: null,
    });
  });

  test("the same tier again is not a change — no reason, no role needed", () => {
    assert.deepEqual(tierChangeGate({ from: 2, to: 2, role: "dispatcher" }), { changed: false, error: null });
    assert.deepEqual(tierChangeGate({ from: null, to: null, role: "dispatcher" }), { changed: false, error: null });
    assert.deepEqual(tierChangeGate({ from: undefined, to: null, role: "dispatcher" }), { changed: false, error: null });
  });

  test("a dispatcher can never move a tier, reason or not", () => {
    assert.deepEqual(tierChangeGate({ from: 2, to: 1, reason: "top RPM", role: "dispatcher" }), {
      changed: true,
      error: { status: 403, message: "Only the owner sets tiers." },
    });
  });

  test("the owner needs a written reason — blank is not a reason", () => {
    for (const reason of [undefined, null, "", "   ", 7]) {
      assert.deepEqual(
        tierChangeGate({ from: 2, to: 1, reason, role: "admin" }),
        { changed: true, error: { status: 400, message: "A tier change needs a reason." } },
        String(reason),
      );
    }
  });

  test("the owner with a reason passes — including to and from 'no tier'", () => {
    assert.deepEqual(tierChangeGate({ from: 2, to: 1, reason: "$6.94 all-in · above Strong", role: "admin" }), {
      changed: true,
      error: null,
    });
    assert.deepEqual(tierChangeGate({ from: null, to: 3, reason: "third load landed", role: "admin" }), {
      changed: true,
      error: null,
    });
    assert.deepEqual(tierChangeGate({ from: 1, to: null, reason: "under three loads", role: "admin" }), {
      changed: true,
      error: null,
    });
  });
});

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
