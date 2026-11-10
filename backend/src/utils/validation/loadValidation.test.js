import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  validateDateOrder,
  validateLoadCreate,
  validateLoadPatch,
  BOOKER_REQUIRED,
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

describe("ODO-05/06 — odometer window and the delivered load", () => {
  const NEEDS = "a delivered load needs its end odometer and its delivery date — empty miles, the Friday accrual and break-even all read them";
  const delivered = { load_status: "delivered", delivery_date: "2026-10-14", odometer_start: 500000, odometer_end: 500850 };
  const mine = (errors) => errors.filter((e) => /odometer|delivered/.test(e));
  const create = (over) => mine(validateLoadCreate({ ...delivered, ...over }));

  test("a delivered load with its date and both readings passes", () => {
    assert.deepEqual(create({}), []);
  });
  test("a delivered create without end, start or date says the nodded sentence", () => {
    assert.deepEqual(create({ odometer_end: null }), [NEEDS]);
    assert.deepEqual(create({ odometer_start: undefined }), [NEEDS]);
    assert.deepEqual(create({ delivery_date: null }).filter((e) => e === NEEDS), [NEEDS]);
  });
  test("a booked load needs none of it", () => {
    assert.deepEqual(create({ load_status: "booked", delivery_date: undefined, odometer_start: undefined, odometer_end: undefined }), []);
  });
  test("end must be greater than start", () => {
    assert.match(create({ odometer_end: 500000 })[0], /odometer_end \(500000\) must be greater than odometer_start \(500000\)/);
    assert.match(create({ odometer_end: 499999 })[0], /must be greater than odometer_start/);
  });
  test("a typed 0 is refused, null and absent are not", () => {
    assert.ok(mine(validateLoadPatch({ odometer_start: 0 })).includes("odometer_start must be greater than 0"));
    assert.ok(mine(validateLoadPatch({ odometer_end: 0 })).includes("odometer_end must be greater than 0"));
    assert.deepEqual(validateLoadPatch({ odometer_start: null, odometer_end: null }), []);
    assert.deepEqual(validateLoadPatch({ odometer_start: undefined }), []);
  });
  test("fuel_surcharge and linehaul money fields", () => {
    assert.deepEqual(validateLoadPatch({ fuel_surcharge: 0 }), []);
    assert.deepEqual(validateLoadPatch({ fuel_surcharge: -1 }), ["fuel_surcharge must be greater than or equal to 0"]);
    assert.deepEqual(validateLoadPatch({ linehaul: -1 }), ["linehaul must be greater than 0"]);
  });
  test("a patch merges over the stored readings when the caller supplies them", () => {
    const existing = { pickup_date: "2026-10-12", delivery_date: "2026-10-14", load_status: "delivered", odometer_start: 500000, odometer_end: 500850 };
    assert.deepEqual(validateLoadPatch({ odometer_end: 400000 }, existing).filter((e) => /must be greater/.test(e)).length, 1);
    assert.ok(validateLoadPatch({ odometer_end: null }, existing).includes(NEEDS));
    assert.deepEqual(validateLoadPatch({ load_status: "delivered" }), []); // stored row unseen: nothing to judge
  });
});

describe("GL-106 — booked_by is required", () => {
  const BOOKER = "7d0f6a52-3a6f-4142-8e6d-5f6071829304";
  const bookerErrors = (errors) => errors.filter((e) => e.includes("booker") || e.includes("booked_by"));

  test("a create without booked_by says the booker sentence", () => {
    assert.deepEqual(bookerErrors(validateLoadCreate({})), [BOOKER_REQUIRED]);
  });
  test("a create with a UUID booker passes the rule", () => {
    assert.deepEqual(bookerErrors(validateLoadCreate({ booked_by: BOOKER })), []);
  });
  test("a create with null or blank says the sentence once", () => {
    assert.deepEqual(bookerErrors(validateLoadCreate({ booked_by: null })), [BOOKER_REQUIRED]);
    assert.deepEqual(bookerErrors(validateLoadCreate({ booked_by: " " })), [BOOKER_REQUIRED]);
  });
  test("a non-uuid is refused by name without throwing", () => {
    assert.deepEqual(bookerErrors(validateLoadCreate({ booked_by: "nope" })), ["booked_by is not a valid UUID"]);
    assert.deepEqual(bookerErrors(validateLoadCreate({ booked_by: 7 })), ["booked_by is not a valid UUID"]);
  });
  test("a patch that does not mention booked_by is untouched; one that nulls it is refused", () => {
    assert.deepEqual(bookerErrors(validateLoadPatch({ load_number: "1" })), []);
    assert.deepEqual(bookerErrors(validateLoadPatch({ booked_by: null })), [BOOKER_REQUIRED]);
    assert.deepEqual(bookerErrors(validateLoadPatch({ booked_by: "" })), [BOOKER_REQUIRED]);
    assert.deepEqual(bookerErrors(validateLoadPatch({ booked_by: BOOKER })), []);
  });
});

describe("106 — the console's stop stamps", () => {
  const STAMPS = ["shipper_in_at", "shipper_out_at", "receiver_in_at", "receiver_out_at"];

  test("every one of the four is validated, not just the pair I remembered", () => {
    for (const f of STAMPS) {
      assert.deepEqual(validateLoadPatch({ [f]: "nope" }), [`${f} must be a timestamp`]);
    }
  });
  test("an ISO moment passes — that is what the console sends", () => {
    for (const f of STAMPS) {
      assert.deepEqual(validateLoadPatch({ [f]: "2026-11-10T14:32:07.001Z" }), []);
    }
  });
  test("null clears a mis-tap, and absence is not a change", () => {
    assert.deepEqual(validateLoadPatch({ shipper_in_at: null }), []);
    assert.deepEqual(validateLoadPatch({ shipper_in_at: undefined }), []);
  });
  test("a bare time of day is refused — the stamp's whole point is the date", () => {
    assert.deepEqual(validateLoadPatch({ shipper_in_at: "14:32:00" }), [
      "shipper_in_at must be a timestamp",
    ]);
  });
  test("a create does not take stamps at all; it takes the time-only columns", () => {
    // Not a validation rule — the create allowlist in loadServices refuses the
    // field by name. Recorded here so the asymmetry is deliberate, not a gap.
    assert.deepEqual(validateLoadPatch({ shipper_in: "14:32:00" }), []);
  });
});
