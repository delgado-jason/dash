import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  AGENCY_CREATE_FIELDS,
  AGENCY_PATCH_FIELDS,
  normalizeAgencyText,
  validateAgencyCreate,
  validateAgencyPatch,
  postingCodeRule,
} from "./agencyValidation.js";

describe("agency_code — the agency's own 3-letter code", () => {
  test("create requires one", () => {
    assert.deepEqual(validateAgencyCreate({ agency_code: "CPL" }), []);
    assert.deepEqual(validateAgencyCreate({}), ["Missing agency_code"]);
    assert.deepEqual(validateAgencyCreate({ name: "Central Pennsylvania Logistics Inc" }), [
      "Missing agency_code",
    ]);
  });

  test("exactly three letters — nothing else is a Landstar code", () => {
    for (const bad of ["CP", "CPLX", "C1L", "C L", "   "]) {
      assert.deepEqual(
        validateAgencyPatch({ agency_code: bad }),
        bad.trim().length === 0
          ? ["agency_code cannot be blank"]
          : ["agency_code must be 3 uppercase letters"],
        bad,
      );
    }
  });

  // The service normalizes before it validates, so this is what a person
  // typing "cpl" actually gets: the stored code, not a 400. A code that is
  // the wrong LENGTH is still refused — normalizing can't invent letters.
  test("case and padding are normalized, never refused — ' cpl ' is stored CPL", () => {
    const data = normalizeAgencyText({ agency_code: " cpl " });
    assert.equal(data.agency_code, "CPL");
    assert.deepEqual(validateAgencyPatch(data), []);

    const created = normalizeAgencyText({ agency_code: "cpl" });
    assert.equal(created.agency_code, "CPL");
    assert.deepEqual(validateAgencyCreate(created), []);

    for (const bad of ["cp", "cplx"]) {
      const d = normalizeAgencyText({ agency_code: bad });
      assert.deepEqual(validateAgencyPatch(d), ["agency_code must be 3 uppercase letters"], bad);
    }
  });

  test("a non-string is refused without throwing", () => {
    assert.deepEqual(validateAgencyPatch({ agency_code: 42 }), ["agency_code must be a string"]);
    assert.deepEqual(validateAgencyPatch({ agency_code: null }), ["agency_code must be a string"]);
  });
});

describe("name — the legal name off the freight bill", () => {
  test("optional: NULL until a bill names it", () => {
    assert.deepEqual(validateAgencyCreate({ agency_code: "JVL" }), []);
    assert.deepEqual(validateAgencyPatch({ name: null }), []);
    assert.deepEqual(validateAgencyPatch({ name: undefined }), []);
    assert.deepEqual(validateAgencyPatch({ name: "" }), []);
  });

  test("a real name passes; 120 characters is the cap", () => {
    assert.deepEqual(validateAgencyPatch({ name: "Central Pennsylvania Logistics Inc" }), []);
    assert.deepEqual(validateAgencyPatch({ name: "x".repeat(120) }), []);
    assert.deepEqual(validateAgencyPatch({ name: "x".repeat(121) }), [
      "name cannot be more than 120 characters",
    ]);
  });

  test("a non-string is refused", () => {
    assert.deepEqual(validateAgencyPatch({ name: 42 }), ["name must be a string"]);
  });

  // "" is NOT "no name on file": stored as-is it sorts FIRST under
  // `ORDER BY name NULLS LAST, agency_code`, putting the nameless agency at
  // the top of the book. The normalizer collapses it to NULL before the write,
  // so a blank in the form and a NULL in the row read as the same thing — and
  // a PATCH with a blank name CLEARS the name.
  test("a blank name is stored as NULL, not as an empty string", () => {
    for (const blank of ["", "   ", "\t\n"]) {
      const data = normalizeAgencyText({ name: blank });
      assert.equal(data.name, null, JSON.stringify(blank));
      assert.deepEqual(validateAgencyPatch(data), []);
    }
    const kept = normalizeAgencyText({ name: "  Central Pennsylvania Logistics Inc " });
    assert.equal(kept.name, "Central Pennsylvania Logistics Inc");
    assert.deepEqual(validateAgencyPatch(kept), []);
  });

  test("normalizeAgencyText leaves null, undefined and non-strings to the rules", () => {
    const data = { agency_code: 42, name: null, rating: 4 };
    assert.equal(normalizeAgencyText(data), data);
    assert.deepEqual(data, { agency_code: 42, name: null, rating: 4 });
    assert.deepEqual(normalizeAgencyText({}), {});
  });
});

describe("the rest of the agency row", () => {
  test("phone, email, rating and notes keep their old rules", () => {
    assert.deepEqual(
      validateAgencyPatch({
        phone: "(717) 555-0100",
        email: "desk@lstrcpl.com",
        rating: 4,
        notes: "posts flatbed out of Mechanicsburg",
      }),
      [],
    );
    assert.deepEqual(validateAgencyPatch({ email: "nope" }), ["not a valid email"]);
    assert.deepEqual(validateAgencyPatch({ rating: 6 }), ["rating must be between 1 and 5"]);
    assert.deepEqual(validateAgencyPatch({ rating: 2.5 }), ["rating must be an integer"]);
    assert.deepEqual(validateAgencyPatch({ notes: "   " }), ["notes cannot be blank"]);
  });

  // 0 is not "no rating" — it is a number the caller sent, and the column's
  // CHECK (rating BETWEEN 1 AND 5) refuses it. Caught here it is a 400 with a
  // sentence; skipped as falsy it reached Postgres as a 500.
  test("rating 0 is a 400, not a raw CHECK violation", () => {
    assert.deepEqual(validateAgencyPatch({ rating: 0 }), ["rating must be between 1 and 5"]);
    assert.deepEqual(validateAgencyCreate({ agency_code: "CPL", rating: 0 }), [
      "rating must be between 1 and 5",
    ]);
    // "not on file" still skips the check.
    assert.deepEqual(validateAgencyPatch({ rating: null }), []);
    assert.deepEqual(validateAgencyPatch({ rating: undefined }), []);
  });

  test("an empty patch has nothing to complain about", () => {
    assert.deepEqual(validateAgencyPatch({}), []);
  });

  test("a whole create passes as one", () => {
    assert.deepEqual(
      validateAgencyCreate({
        agency_code: "CPL",
        name: "Central Pennsylvania Logistics Inc",
        phone: "(717) 555-0100",
        email: "desk@lstrcpl.com",
        rating: 5,
        notes: null,
      }),
      [],
    );
  });
});

describe("postingCodeRule — shared with agents", () => {
  test("null and undefined pass: they post from the agency's desk", () => {
    const errors = [];
    postingCodeRule(null, errors);
    postingCodeRule(undefined, errors);
    assert.deepEqual(errors, []);
  });

  test("three uppercase letters is the only code shape", () => {
    const ok = [];
    postingCodeRule("MAM", ok);
    assert.deepEqual(ok, []);

    for (const bad of ["mam", "MA", "MAMA", "M1M"]) {
      const errors = [];
      postingCodeRule(bad, errors);
      assert.deepEqual(errors, ["posting_code must be 3 uppercase letters"], bad);
    }
  });

  test("blank and non-strings are refused", () => {
    const blank = [];
    postingCodeRule("   ", blank);
    assert.deepEqual(blank, ["posting_code cannot be blank"]);

    const wrongType = [];
    postingCodeRule(42, wrongType);
    assert.deepEqual(wrongType, ["posting_code must be a string"]);
  });
});

// posting_codes is EVIDENCE (075 §5d): every code an agency has ever posted
// under, appended by the settlement feed. It is not in either whitelist, so a
// client that tries to write it is refused before anything reaches the DB.
//
// The whitelists are asserted HERE, against the exported lists themselves —
// importing agencyServices to prove it would drag the db pool into a
// validation test, which is the one thing these tests exist to avoid. The
// service refuses `field not allowed` for anything off these lists; this pins
// what is on them.
describe("posting_codes is never client-written", () => {
  test("posting_codes is on neither whitelist", () => {
    assert.equal(AGENCY_CREATE_FIELDS.includes("posting_codes"), false);
    assert.equal(AGENCY_PATCH_FIELDS.includes("posting_codes"), false);
  });

  test("nor is any other column the row keeps for itself", () => {
    for (const own of ["agency_id", "user_id", "created_at", "updated_at"]) {
      assert.equal(AGENCY_CREATE_FIELDS.includes(own), false, own);
      assert.equal(AGENCY_PATCH_FIELDS.includes(own), false, own);
    }
  });

  test("the client may write exactly these, and they all have rules", () => {
    const writable = ["agency_code", "name", "phone", "email", "rating", "notes"];
    assert.deepEqual([...AGENCY_CREATE_FIELDS], writable);
    assert.deepEqual([...AGENCY_PATCH_FIELDS], writable);
    // Every whitelisted field is one the validators actually judge: a field
    // the service lets through with no rule behind it reaches Postgres raw.
    for (const field of AGENCY_PATCH_FIELDS) {
      assert.equal(validateAgencyPatch({ [field]: 42 }).length > 0, true, field);
    }
  });

  test("the lists are frozen — nothing widens the whitelist at runtime", () => {
    assert.equal(Object.isFrozen(AGENCY_CREATE_FIELDS), true);
    assert.equal(Object.isFrozen(AGENCY_PATCH_FIELDS), true);
  });
});
