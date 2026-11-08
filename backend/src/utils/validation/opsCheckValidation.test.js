import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeOpsCheck, DEPOSIT_LANDED_ERROR } from "./opsCheckValidation.js";

test("a typed balance lands as a number on its date, note trimmed", () => {
  assert.deepEqual(normalizeOpsCheck({ as_of: "2026-09-30", balance: "7,309.08", note: "  before payroll " }), {
    as_of: "2026-09-30", balance: 7309.08, note: "before payroll", deposit_landed: null,
  });
  assert.deepEqual(normalizeOpsCheck({ as_of: "2026-09-30", balance: 0 }).balance, 0);
  assert.equal(normalizeOpsCheck({ as_of: "2026-09-30", balance: 1, note: "" }).note, null);
});

test("an overdrawn account is a number too", () => {
  assert.equal(normalizeOpsCheck({ as_of: "2026-09-30", balance: "-412.10" }).balance, -412.1);
});

test("the date and the balance are required and sane", () => {
  assert.throws(() => normalizeOpsCheck({ as_of: "Sep 30", balance: 1 }), /YYYY-MM-DD/);
  assert.throws(() => normalizeOpsCheck({ as_of: "2026-09-30" }), /balance is required/);
  assert.throws(() => normalizeOpsCheck({ as_of: "2026-09-30", balance: "lots" }), /between/);
  assert.throws(() => normalizeOpsCheck({ as_of: "2026-09-30", balance: 99_999_999 }), /between/);
});

// A check re-bases the board from its day forward: a month mis-picked in the
// native date picker would overwrite the simulation with a balance that day
// never had. The clock is injected (CLAUDE.md: control the clock).
test("a balance can only be from today or earlier", () => {
  const now = new Date("2026-09-30T18:00:00Z");
  assert.throws(
    () => normalizeOpsCheck({ as_of: "2026-10-05", balance: 99_000 }, now),
    /today or earlier/,
  );
  assert.throws(
    () => normalizeOpsCheck({ as_of: "2027-09-30", balance: 7309.08 }, now),
    /today or earlier/,
  );
  // Today and yesterday stand; so does UTC-tomorrow, the slack a Central
  // evening needs against a UTC server.
  assert.equal(normalizeOpsCheck({ as_of: "2026-09-30", balance: 1 }, now).as_of, "2026-09-30");
  assert.equal(normalizeOpsCheck({ as_of: "2026-09-29", balance: 1 }, now).as_of, "2026-09-29");
  assert.equal(normalizeOpsCheck({ as_of: "2026-10-01", balance: 1 }, now).as_of, "2026-10-01");
});

// Q3 (migration 096): NULL = not asked, FALSE = typed before it landed,
// TRUE = already inside the balance.
test("deposit_landed: true and false stand, absent is null (not asked), anything else is refused", () => {
  const base = { as_of: "2026-10-08", balance: 1 };
  assert.equal(normalizeOpsCheck({ ...base, deposit_landed: true }).deposit_landed, true);
  assert.equal(normalizeOpsCheck({ ...base, deposit_landed: false }).deposit_landed, false);
  assert.equal(normalizeOpsCheck(base).deposit_landed, null);
  assert.equal(normalizeOpsCheck({ ...base, deposit_landed: null }).deposit_landed, null);
  for (const bad of ["yes", "true", 1, 0, ""])
    assert.throws(() => normalizeOpsCheck({ ...base, deposit_landed: bad }), (e) => e.message === DEPOSIT_LANDED_ERROR);
});
