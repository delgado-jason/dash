import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  validateDateOrder,
  validateLoadCreate,
  validateLoadPatch,
} from "./loadValidation.js";

const errsFor = (pickup, delivery) => {
  const errors = [];
  validateDateOrder(pickup, delivery, errors);
  return errors;
};

describe("validateDateOrder", () => {
  test("rejects a delivery date earlier than the pickup date", () => {
    // The exact shape of the bug: Jul 14 delivery on a Jul 21 pickup.
    const errors = errsFor("2026-07-21", "2026-07-14");
    assert.equal(errors.length, 1);
    assert.match(errors[0], /delivery_date .* cannot be earlier/);
  });

  test("allows same-day delivery", () => {
    assert.deepEqual(errsFor("2026-07-21", "2026-07-21"), []);
  });

  test("allows a later delivery, including across a year boundary", () => {
    assert.deepEqual(errsFor("2026-07-21", "2026-07-22"), []);
    assert.deepEqual(errsFor("2026-12-31", "2027-01-02"), []);
  });

  test("stays quiet when either date is absent — a booked load hasn't delivered", () => {
    assert.deepEqual(errsFor("2026-07-21", null), []);
    assert.deepEqual(errsFor("2026-07-21", undefined), []);
    assert.deepEqual(errsFor(null, "2026-07-14"), []);
  });

  test("tolerates timestamps and whitespace by comparing the date part", () => {
    assert.deepEqual(errsFor("2026-07-21T00:00:00Z", "2026-07-22T00:00:00Z"), []);
    assert.equal(errsFor(" 2026-07-21 ", " 2026-07-14 ").length, 1);
  });

  test("defers to the per-field shape rules on a malformed date", () => {
    assert.deepEqual(errsFor("nope", "2026-07-14"), []);
  });
});

describe("validateLoadPatch date order", () => {
  const stored = { pickup_date: "2026-07-21", delivery_date: "2026-07-25" };

  test("catches moving delivery before the STORED pickup date", () => {
    const errors = validateLoadPatch({ delivery_date: "2026-07-14" }, stored);
    assert.ok(errors.some((e) => /cannot be earlier/.test(e)));
  });

  test("catches moving pickup after the STORED delivery date", () => {
    const errors = validateLoadPatch({ pickup_date: "2026-07-30" }, stored);
    assert.ok(errors.some((e) => /cannot be earlier/.test(e)));
  });

  test("allows a valid single-field move", () => {
    assert.deepEqual(validateLoadPatch({ delivery_date: "2026-07-22" }, stored), []);
  });

  test("allows both dates moved together", () => {
    const errors = validateLoadPatch(
      { pickup_date: "2026-08-01", delivery_date: "2026-08-03" },
      stored,
    );
    assert.deepEqual(errors, []);
  });

  test("ignores date order on a patch that touches neither date", () => {
    assert.deepEqual(validateLoadPatch({ loaded_miles: 900 }, stored), []);
  });
});

describe("validateLoadPatch claim_filed — decision 4's one checkbox", () => {
  test("true and false pass", () => {
    assert.deepEqual(validateLoadPatch({ claim_filed: true }), []);
    assert.deepEqual(validateLoadPatch({ claim_filed: false }), []);
  });

  test("anything but a boolean is refused by name — the column is NOT NULL", () => {
    for (const bad of [null, "yes", 1, "true"]) {
      assert.deepEqual(validateLoadPatch({ claim_filed: bad }), ["claim_filed must be true or false"], String(bad));
    }
  });

  test("a CREATE carries the same rule — a checkbox value that arrived as text is caught there too", () => {
    // Only the claim_filed verdict is asked for: a bare body reports its own
    // missing mandatory fields, which is a different test's business.
    const claimErrors = (value) => validateLoadCreate({ claim_filed: value }).filter((e) => e.includes("claim_filed"));
    assert.deepEqual(claimErrors(true), []);
    assert.deepEqual(claimErrors(false), []);
    assert.deepEqual(claimErrors(undefined), []); // absent — the column defaults to false
    assert.deepEqual(claimErrors("true"), ["claim_filed must be true or false"]);
    assert.deepEqual(claimErrors("false"), ["claim_filed must be true or false"]);
  });
});

describe("customer_end — decision 5A's one mark", () => {
  const BAD = ["customer_end must be one of: shipper, receiver, neither"];

  test("the three ends pass on a patch", () => {
    assert.deepEqual(validateLoadPatch({ customer_end: "shipper" }), []);
    assert.deepEqual(validateLoadPatch({ customer_end: "receiver" }), []);
    assert.deepEqual(validateLoadPatch({ customer_end: "neither" }), []);
  });

  test("absent passes — the column is NOT NULL DEFAULT 'shipper'", () => {
    assert.deepEqual(validateLoadPatch({ customer_end: undefined }), []);
    assert.deepEqual(validateLoadPatch({}), []);
  });

  test("anything else is refused by name — null included", () => {
    for (const bad of [null, "buyer", "Shipper", "", 1, true, ["receiver"]]) {
      assert.deepEqual(validateLoadPatch({ customer_end: bad }), BAD, JSON.stringify(bad));
    }
  });

  test("a CREATE carries the same rule", () => {
    // Only the customer_end verdict is asked for: a bare body reports its own
    // missing mandatory fields, which is a different test's business.
    const endErrors = (value) =>
      validateLoadCreate({ customer_end: value }).filter((e) => e.includes("customer_end"));
    assert.deepEqual(endErrors("shipper"), []);
    assert.deepEqual(endErrors("receiver"), []);
    assert.deepEqual(endErrors("neither"), []);
    assert.deepEqual(endErrors(undefined), []);
    assert.deepEqual(endErrors("buyer"), BAD);
    assert.deepEqual(endErrors(null), BAD);
  });
});

describe("agency_id — required on a create, clearable on a patch", () => {
  // Only the agency_id verdict is asked for: a bare body reports its own
  // missing mandatory fields, which is a different test's business.
  const agencyErrors = (data) =>
    validateLoadCreate(data).filter((e) => e.includes("agency_id"));

  test("a create without one is refused — a new load is posted through an agency", () => {
    assert.deepEqual(agencyErrors({}), ["Missing agency_id"]);
    assert.deepEqual(agencyErrors({ agency_id: null }), ["Missing agency_id"]);
  });

  test("a create with a real UUID passes", () => {
    assert.deepEqual(agencyErrors({ agency_id: "3f6b2c1e-9c2b-4d0e-8a2f-1b2c3d4e5f60" }), []);
  });

  test("null on a PATCH clears it — loads.agency_id is nullable since 075", () => {
    assert.deepEqual(validateLoadPatch({ agency_id: null }), []);
    assert.deepEqual(validateLoadPatch({ agency_id: undefined }), []);
  });

  test("a non-uuid is refused by name, on create and on patch, without throwing", () => {
    assert.deepEqual(validateLoadPatch({ agency_id: "CPL" }), ["agency_id is not a valid UUID"]);
    assert.deepEqual(validateLoadPatch({ agency_id: 42 }), ["agency_id is not a valid UUID"]);
    assert.deepEqual(agencyErrors({ agency_id: "CPL" }), ["agency_id is not a valid UUID"]);
  });

  test("agent_id names its own field too", () => {
    assert.deepEqual(validateLoadPatch({ agent_id: "nope" }), ["agent_id is not a valid UUID"]);
    assert.deepEqual(validateLoadPatch({ agent_id: null }), ["agent_id is not a valid UUID"]);
  });
});
