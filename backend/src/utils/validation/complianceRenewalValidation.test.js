import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  CDL_NUMBER_MAX,
  DOC_NUMBER_MAX,
  NOTE_MAX,
  isDayKey,
  validateComplianceRenewal,
  addMonths,
} from "./complianceRenewalValidation.js";

// The clock is injected, never read from the machine — otherwise "not in the
// future" rots the day the calendar passes the fixture (CLAUDE.md).
const NOW = new Date("2026-09-13T18:00:00Z");

const ok = (body, now = NOW) => validateComplianceRenewal(body, now);

describe("isDayKey — a real day, not just a well-shaped string", () => {
  test("real days pass, including a leap day", () => {
    for (const good of ["2026-09-13", "2024-02-29", "2026-01-31", "1999-12-31"])
      assert.equal(isDayKey(good), true, good);
  });

  test("a day that does not exist is refused, not rolled over", () => {
    // new Date('2026-02-30') silently becomes March 2 — the reason the check
    // formats the parsed day back and compares instead of trusting the parse.
    for (const bad of ["2026-02-30", "2026-04-31", "2025-02-29", "2026-13-01", "2026-00-10"])
      assert.equal(isDayKey(bad), false, bad);
  });

  test("a timestamp, a US date, a blank and a non-string are all refused", () => {
    for (const bad of ["2026-09-13T00:00:00Z", "09/13/2026", "2026-9-13", "", "  ", null, undefined, 20260913, ["2026-09-13"]])
      assert.equal(isDayKey(bad), false, String(bad));
  });
});

describe("validateComplianceRenewal — the sheet's four fields", () => {
  test("the whole sheet, filled in, passes", () => {
    assert.deepEqual(
      ok({
        renewed_on: "2026-09-13",
        next_expires_on: "2028-09-13",
        doc_number: "MC-2026-0913",
        note: "Dr. Patel, Carlisle PA",
      }),
      [],
    );
  });

  test("renewed_on alone passes — the cadence fills the expiry in", () => {
    assert.deepEqual(ok({ renewed_on: "2026-09-13" }), []);
    assert.deepEqual(ok({ renewed_on: "2026-09-13", next_expires_on: null }), []);
    assert.deepEqual(ok({ renewed_on: "2026-09-13", next_expires_on: "" }), []);
  });

  test("a missing renewed_on is the one hard stop", () => {
    const msg = "A renewal needs the day it was renewed.";
    assert.deepEqual(ok({}), [msg]);
    assert.deepEqual(ok(undefined), [msg]);
    assert.deepEqual(ok({ renewed_on: null }), [msg]);
    assert.deepEqual(ok({ renewed_on: "" }), [msg]);
  });

  test("both dates must be real days", () => {
    assert.deepEqual(ok({ renewed_on: "2026-02-30" }), [
      "renewed_on must be a real YYYY-MM-DD date.",
    ]);
    assert.deepEqual(ok({ renewed_on: "2026-09-13", next_expires_on: "2027-02-30" }), [
      "next_expires_on must be a real YYYY-MM-DD date.",
    ]);
    // A bad next expiry does not also fire the ordering rule — one complaint
    // per problem.
    assert.equal(ok({ renewed_on: "2026-09-13", next_expires_on: "09/13/2028" }).length, 1);
  });

  test("renewed_on may be today or tomorrow, never further out", () => {
    const msg = "A renewal can't be dated in the future.";
    assert.deepEqual(ok({ renewed_on: "2026-09-13" }), []); // today, UTC
    assert.deepEqual(ok({ renewed_on: "2026-09-14" }), []); // the zone's slack
    assert.deepEqual(ok({ renewed_on: "2026-09-15" }), [msg]);
    assert.deepEqual(ok({ renewed_on: "2027-01-01" }), [msg]);
    // Backdating is always fine — papers get renewed before they get entered.
    assert.deepEqual(ok({ renewed_on: "2019-04-02" }), []);
  });

  test("the tomorrow ceiling rolls the month and the year", () => {
    const eve = new Date("2026-12-31T23:59:00Z");
    assert.deepEqual(ok({ renewed_on: "2027-01-01" }, eve), []);
    assert.deepEqual(ok({ renewed_on: "2027-01-02" }, eve), [
      "A renewal can't be dated in the future.",
    ]);
  });

  test("the next expiry has to come after the renewal, not on it", () => {
    const msg = "The next expiry has to come after the renewal date.";
    assert.deepEqual(ok({ renewed_on: "2026-09-13", next_expires_on: "2026-09-13" }), [msg]);
    assert.deepEqual(ok({ renewed_on: "2026-09-13", next_expires_on: "2026-09-12" }), [msg]);
    assert.deepEqual(ok({ renewed_on: "2026-09-13", next_expires_on: "2026-09-14" }), []);
  });

  test("doc_number and note are optional, nullable and bounded", () => {
    assert.deepEqual(ok({ renewed_on: "2026-09-13", doc_number: null, note: null }), []);
    assert.deepEqual(ok({ renewed_on: "2026-09-13", doc_number: "", note: "" }), []);
    assert.deepEqual(ok({ renewed_on: "2026-09-13", doc_number: 42 }), [
      "doc_number must be a string.",
    ]);
    assert.deepEqual(ok({ renewed_on: "2026-09-13", note: {} }), ["note must be a string."]);
    assert.deepEqual(ok({ renewed_on: "2026-09-13", doc_number: "x".repeat(DOC_NUMBER_MAX) }), []);
    assert.deepEqual(ok({ renewed_on: "2026-09-13", doc_number: "x".repeat(DOC_NUMBER_MAX + 1) }), [
      `doc_number cannot be more than ${DOC_NUMBER_MAX} chars.`,
    ]);
    assert.deepEqual(ok({ renewed_on: "2026-09-13", note: "x".repeat(NOTE_MAX + 1) }), [
      `note cannot be more than ${NOTE_MAX} chars.`,
    ]);
  });

  test("the doc_number cap is the caller's column, not one number for both", () => {
    // A compliance item's doc_number defaults to 60 …
    assert.equal(DOC_NUMBER_MAX, 60);
    assert.equal(CDL_NUMBER_MAX, 50);
    // … and the CDL path passes 50, because drivers.cdl_number is VARCHAR(50)
    // and a 51st character there is a Postgres error, not a sentence.
    const cdl = (doc) =>
      validateComplianceRenewal({ renewed_on: "2026-09-13", doc_number: doc }, NOW, {
        docMax: CDL_NUMBER_MAX,
      });
    assert.deepEqual(cdl("x".repeat(CDL_NUMBER_MAX)), []);
    assert.deepEqual(cdl("x".repeat(CDL_NUMBER_MAX + 1)), [
      `doc_number cannot be more than ${CDL_NUMBER_MAX} chars.`,
    ]);
    // The same 60-char number passes as a document and fails as a CDL.
    const sixty = "x".repeat(DOC_NUMBER_MAX);
    assert.deepEqual(ok({ renewed_on: "2026-09-13", doc_number: sixty }), []);
    assert.deepEqual(cdl(sixty), [
      `doc_number cannot be more than ${CDL_NUMBER_MAX} chars.`,
    ]);
    // An options object without docMax still gets the default.
    assert.deepEqual(
      validateComplianceRenewal(
        { renewed_on: "2026-09-13", doc_number: sixty },
        NOW,
        {},
      ),
      [],
    );
  });

  test("nothing but the four fields may ride along — no item id, no renewed_by", () => {
    assert.deepEqual(ok({ renewed_on: "2026-09-13", renewed_by: "me" }), [
      "renewed_by not allowed",
    ]);
    assert.deepEqual(ok({ renewed_on: "2026-09-13", compliance_item_id: "x", user_id: "y" }), [
      "compliance_item_id not allowed",
      "user_id not allowed",
    ]);
  });

  test("every problem is reported, not just the first", () => {
    assert.equal(
      ok({ renewed_on: "2026-02-30", next_expires_on: "nope", doc_number: 1 }).length,
      3,
    );
  });
});

describe("addMonths — the cadence's next expiry, clamped to the month", () => {
  test("a plain cadence lands on the same day number", () => {
    assert.equal(addMonths("2026-09-13", 24), "2028-09-13");
    assert.equal(addMonths("2026-09-13", 12), "2027-09-13");
    assert.equal(addMonths("2026-09-13", 1), "2026-10-13");
    assert.equal(addMonths("2026-09-13", 60), "2031-09-13");
  });

  test("the month rolls the year, forward and across December", () => {
    assert.equal(addMonths("2026-12-31", 1), "2027-01-31");
    assert.equal(addMonths("2026-11-30", 2), "2027-01-30");
    assert.equal(addMonths("2026-01-01", 120), "2036-01-01");
  });

  test("a day the landing month does not have clamps to its end", () => {
    assert.equal(addMonths("2026-01-31", 1), "2026-02-28"); // not March 3
    assert.equal(addMonths("2024-01-31", 1), "2024-02-29"); // leap year
    assert.equal(addMonths("2026-01-31", 3), "2026-04-30");
    assert.equal(addMonths("2026-08-31", 6), "2027-02-28");
    assert.equal(addMonths("2026-05-31", 1), "2026-06-30");
  });

  test("a leap day plus twelve months clamps to Feb 28", () => {
    assert.equal(addMonths("2024-02-29", 12), "2025-02-28");
    assert.equal(addMonths("2024-02-29", 48), "2028-02-29");
  });

  test("garbage in, null out — never a half-made date", () => {
    assert.equal(addMonths("2026-02-30", 12), null);
    assert.equal(addMonths("not a date", 12), null);
    assert.equal(addMonths(null, 12), null);
    assert.equal(addMonths("2026-09-13", null), null);
    assert.equal(addMonths("2026-09-13", 1.5), null);
  });
});
