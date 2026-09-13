import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  REVIEW_KINDS,
  TARGET_LINES_MAX,
  TARGETS_MAX,
  isPeriodKey,
  targetLines,
  validateRelationshipReview,
} from "./relationshipReviewValidation.js";

const month = { period_key: "2026-09", kind: "month", targets: "two inbound offers\nfootprints on every prospect call" };
const quarter = { period_key: "2026-Q3", kind: "quarter", targets: "Gary Robinson\nLisa Edwards\nDrew Hannon" };

describe("validateRelationshipReview — the sign-off", () => {
  test("a month with one to three target lines passes", () => {
    assert.deepEqual(validateRelationshipReview(month), []);
    assert.deepEqual(validateRelationshipReview({ ...month, targets: "one target" }), []);
    assert.deepEqual(validateRelationshipReview({ ...month, targets: "a\nb\nc" }), []);
  });

  test("a quarter with one to five names passes; blank lines don't count", () => {
    assert.deepEqual(validateRelationshipReview(quarter), []);
    assert.deepEqual(validateRelationshipReview({ ...quarter, targets: "a\n\nb\n\n\nc\nd\ne\n" }), []);
    // Five is a ceiling, not a quota — one name is a whole quarter's intent.
    assert.deepEqual(validateRelationshipReview({ ...quarter, targets: "Gary Robinson" }), []);
  });

  test("kind is month or quarter — nothing else", () => {
    assert.deepEqual(REVIEW_KINDS, ["month", "quarter"]);
    assert.deepEqual(validateRelationshipReview({ ...month, kind: "week" }), ["kind must be month or quarter"]);
    assert.deepEqual(validateRelationshipReview({ ...month, kind: undefined }), ["kind must be month or quarter"]);
  });

  test("the period key's shape follows the kind", () => {
    for (const bad of ["2026-9", "2026-13", "2026-Q3", "202609", "2026-09-01", 202609, null]) {
      assert.deepEqual(validateRelationshipReview({ ...month, period_key: bad }), ["period_key must be YYYY-MM for a month"], String(bad));
    }
    for (const bad of ["2026-09", "2026-Q5", "2026-q3", "Q3-2026", "2026-Q0"]) {
      assert.deepEqual(validateRelationshipReview({ ...quarter, period_key: bad }), ["period_key must be YYYY-Qn for a quarter"], bad);
    }
    assert.equal(isPeriodKey("2026-12", "month"), true);
    assert.equal(isPeriodKey("2026-Q4", "quarter"), true);
  });

  test("targets is required text with at least one non-blank line", () => {
    assert.deepEqual(validateRelationshipReview({ ...month, targets: undefined }), ["targets must be a string"]);
    assert.deepEqual(validateRelationshipReview({ ...month, targets: null }), ["targets must be a string"]);
    assert.deepEqual(validateRelationshipReview({ ...month, targets: ["a"] }), ["targets must be a string"]);
    assert.deepEqual(validateRelationshipReview({ ...month, targets: "" }), ["targets needs at least one line"]);
    assert.deepEqual(validateRelationshipReview({ ...month, targets: " \n\n " }), ["targets needs at least one line"]);
  });

  test("the line ceiling is three for a month and five for a quarter", () => {
    assert.deepEqual(TARGET_LINES_MAX, { month: 3, quarter: 5 });
    assert.deepEqual(validateRelationshipReview({ ...month, targets: "a\nb\nc\nd" }), ["targets is one to 3 lines"]);
    assert.deepEqual(validateRelationshipReview({ ...quarter, targets: "a\nb\nc\nd\ne" }), []);
    assert.deepEqual(validateRelationshipReview({ ...quarter, targets: "a\nb\nc\nd\ne\nf" }), ["targets is one to 5 lines"]);
  });

  test("a wall of text is refused before the lines are counted", () => {
    assert.deepEqual(validateRelationshipReview({ ...month, targets: "x".repeat(TARGETS_MAX + 1) }), [
      `targets cannot be more than ${TARGETS_MAX} characters`,
    ]);
  });

  test("the sign-off's identity is the server's — no reviewed_by, no reviewed_at, no user_id", () => {
    assert.deepEqual(validateRelationshipReview({ ...month, reviewed_by: "me", reviewed_at: "now", user_id: "x" }), [
      "reviewed_by not allowed",
      "reviewed_at not allowed",
      "user_id not allowed",
    ]);
  });

  test("an empty or missing body reports the kind and the targets", () => {
    assert.deepEqual(validateRelationshipReview({}), ["kind must be month or quarter", "targets must be a string"]);
    assert.deepEqual(validateRelationshipReview(undefined), ["kind must be month or quarter", "targets must be a string"]);
  });
});

describe("targetLines", () => {
  test("splits on either line ending, trims, drops blanks", () => {
    assert.deepEqual(targetLines("a\r\n b \n\n\nc"), ["a", "b", "c"]);
    assert.deepEqual(targetLines(""), []);
    assert.deepEqual(targetLines(null), []);
  });
});
