import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolveNextExpiry } from "./complianceServices.js";

// The date the renewal actually writes to the item. The sheet's own date is
// validated before it gets here; this helper's job is the OTHER source — the
// date the cadence computes, which nobody typed and nobody sees until the row
// has already rolled forward.
//
// No database is touched: resolveNextExpiry is pure string work, and pg's Pool
// opens no connection until something queries it.

const RENEWED = "2026-09-13";
const SENTENCE = "A renewal needs the next expiry date.";

const throws400 = (fn) =>
  assert.throws(fn, (err) => {
    assert.equal(err.type, "validation");
    assert.equal(err.statusCode, 400);
    assert.equal(err.message, SENTENCE);
    return true;
  });

describe("resolveNextExpiry — the sheet's date, else the cadence's", () => {
  test("a date on the body wins, cadence or no cadence", () => {
    assert.equal(resolveNextExpiry({ next_expires_on: "2028-09-13" }, RENEWED, 24), "2028-09-13");
    assert.equal(resolveNextExpiry({ next_expires_on: "2027-01-01" }, RENEWED, null), "2027-01-01");
  });

  test("no date sent → the cadence computes one, clamped to the month", () => {
    assert.equal(resolveNextExpiry({}, RENEWED, 24), "2028-09-13");
    assert.equal(resolveNextExpiry({ next_expires_on: null }, RENEWED, 12), "2027-09-13");
    assert.equal(resolveNextExpiry({ next_expires_on: "" }, RENEWED, 1), "2026-10-13");
    assert.equal(resolveNextExpiry({}, "2026-01-31", 1), "2026-02-28");
  });

  test("no date and no cadence is the 400 — the date is the whole point", () => {
    throws400(() => resolveNextExpiry({}, RENEWED, null));
    throws400(() => resolveNextExpiry({ next_expires_on: null }, RENEWED, undefined));
    // The CDL path always lands here: a driver record carries no cadence.
    throws400(() => resolveNextExpiry({ next_expires_on: "" }, RENEWED, null));
  });

  test("a cadence that can't compute an honest date is the same 400", () => {
    throws400(() => resolveNextExpiry({}, RENEWED, 0)); // no cadence at all
    throws400(() => resolveNextExpiry({}, RENEWED, 1.5)); // not whole months
    throws400(() => resolveNextExpiry({}, "2026-02-30", 12)); // not a real day
  });

  test("a computed date that lands on or before the renewal is refused, not written", () => {
    // A seeded cadence of 0 or less computes a REAL date — in the past — and
    // would file a new cycle as already expired. The owner gets the sentence
    // instead, and the item's clock is left alone.
    throws400(() => resolveNextExpiry({}, RENEWED, -12));
    throws400(() => resolveNextExpiry({}, RENEWED, -1));
    // …while one month forward still passes, so the guard only catches the
    // backwards case.
    assert.equal(resolveNextExpiry({}, RENEWED, 1), "2026-10-13");
  });
});
