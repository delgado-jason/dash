import { db } from "../../db/pool.js";
import { ValidationError, ForbiddenError } from "../utils/error.js";
import {
  targetLines,
  validateRelationshipReview,
} from "../utils/validation/relationshipReviewValidation.js";

// The month sign-off and the quarter audit (073 §6, REL-01 v2.0 §5H): one row
// per (account, period, kind). Reading is for everyone on the account — the
// dispatcher sees REVIEWED / unsigned the same as the owner; writing is the
// owner's, the same rule as the tier. The signer's name is joined for the
// pill ("REVIEWED Sep 30 · Jason").
const FIELDS = `r.review_id, r.period_key, r.kind, r.targets, r.reviewed_by, r.reviewed_at,
  u.display_name AS reviewed_by_name`;
const FROM = `FROM relationship_reviews r
  LEFT JOIN users u ON u.user_id = r.reviewed_by`;

export async function getRelationshipReviews(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT ${FIELDS} ${FROM} WHERE r.user_id = $1 ORDER BY r.period_key DESC, r.kind`,
    [user_id],
  );
  return result.rows;
}

// Upsert on (user_id, period_key, kind): signing again replaces the targets
// and re-stamps who and when — the latest signature is the one that stands.
// Targets are stored as their non-blank lines, so what is read back is
// exactly what the Review prints.
export async function upsertRelationshipReview(user_id, data, actor = {}) {
  if (!user_id) throw new ValidationError("Missing user_id");
  // One sentence for both kinds — a quarter is audited, not "signed the
  // month", and the dispatcher should never be told the wrong thing about
  // which write was refused.
  if (actor.role !== "admin") throw new ForbiddenError("Only the owner signs off.");
  const errors = validateRelationshipReview(data);
  if (errors.length > 0) throw new ValidationError(errors.join("; "), errors);

  const { period_key, kind, targets } = data;
  const ins = await db.query(
    `INSERT INTO relationship_reviews (user_id, period_key, kind, targets, reviewed_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, period_key, kind) DO UPDATE
       SET targets = EXCLUDED.targets,
           reviewed_by = EXCLUDED.reviewed_by,
           reviewed_at = now()
     RETURNING review_id`,
    [user_id, period_key, kind, targetLines(targets).join("\n"), actor.self_id ?? null],
  );
  const row = await db.query(`SELECT ${FIELDS} ${FROM} WHERE r.review_id = $1`, [ins.rows[0].review_id]);
  return row.rows[0];
}
