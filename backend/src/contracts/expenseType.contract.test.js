// EXPTYPE-01 · fixed/variable is read through the category defaults.
//
// Rule-change gate: a deliberate change to the rule below is ONE red test
// here, and the PR body must carry a 'Rule change: <id> — <why>' line.
//
// WHY THIS IS LOCKED. `expense_lines.type` records what was believed when the
// month was uploaded. The CURRENT answer lives in expense_category_defaults,
// one row per category. Nothing reconciled the two, and on 2026-07-09 they
// drifted: four months were backfilled as `variable`, May was then flipped to
// `fixed`, and June was created in the same minute and kept the old value.
// Four of ten months disagreed with the other six for four months and nothing
// said so.
//
// That split is not decorative — it feeds the sit/run burn, which feeds the
// landing page's leave reserve. While it was wrong, "cost to sit" understated
// a parked day by $293 a week. Reading the line's own type again would
// silently reintroduce exactly that, with no test anywhere else to catch it,
// which is why the rule is pinned to the query text.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { setCategoryType } from "../services/expenseServices.js";

const source = readFileSync(
  fileURLToPath(new URL("../services/expenseServices.js", import.meta.url)),
  "utf8",
);

// The lines query that feeds the Expenses page and, through it, the burn.
const linesQuery = (() => {
  const i = source.indexOf("FROM expense_lines l");
  assert.notEqual(i, -1, "the period's lines query moved — re-point this contract");
  return source.slice(i - 400, i + 400);
})();

describe("EXPTYPE-01 · the period's lines read their type from the defaults", () => {
  test("the type column is COALESCEd through expense_category_defaults", () => {
    assert.match(
      linesQuery,
      /COALESCE\(\s*d\.type\s*,\s*l\.type\s*\)\s+AS\s+type/i,
      "a period's lines must return the CATEGORY's current type, not the line's stored one",
    );
  });

  test("the join is a LEFT JOIN on user and category", () => {
    // LEFT, not inner: a category with no default row at all must still come
    // back, falling through to its stored type — the only answer available.
    assert.match(
      linesQuery,
      /LEFT JOIN expense_category_defaults d[\s\S]*?d\.user_id\s*=\s*l\.user_id[\s\S]*?d\.category\s*=\s*l\.category/i,
      "the defaults join must be LEFT and keyed on both user_id and category",
    );
  });
});

describe("EXPTYPE-01 · setCategoryType settles a category everywhere", () => {
  // These guards run before any database work, so they never touch a pool.
  test("a missing user is refused", async () => {
    await assert.rejects(setCategoryType(null, "Fuel", "fixed"), /Missing user_id/);
  });

  test("a blank category is refused", async () => {
    await assert.rejects(setCategoryType("u1", "", "fixed"), /category is required/);
  });

  test("a type that is neither fixed nor variable is refused", async () => {
    for (const bad of ["", "FIXED", "semi", null, undefined, 0]) {
      await assert.rejects(
        setCategoryType("u1", "Fuel", bad),
        /type must be fixed or variable/,
        `"${String(bad)}" should not be accepted as a classification`,
      );
    }
  });

  test("the upsert writes the type and preserves any cuttability already set", () => {
    const i = source.indexOf("export async function setCategoryType");
    const fn = source.slice(i, i + 1200);
    assert.match(fn, /ON CONFLICT \(user_id, category\)/);
    assert.match(fn, /DO UPDATE SET type = EXCLUDED\.type/);
    // Re-classifying a category must not wipe the cut-planner override on it.
    assert.match(
      fn,
      /SELECT cuttability FROM expense_category_defaults/,
      "setting a type must carry the existing cuttability through, not null it",
    );
    assert.doesNotMatch(
      fn,
      /DO UPDATE SET[^;]*cuttability\s*=/,
      "the type write must never touch cuttability",
    );
  });
});
