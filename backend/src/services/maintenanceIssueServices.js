import { db } from "../../db/pool.js";
import { ValidationError, NotFoundError } from "../utils/error.js";
import { validateIssue, ISSUE_FIELDS } from "../utils/validation/maintenanceValidation.js";

// OPEN ISSUES (the Maintenance sheet, call 6): a defect noticed on the road —
// what, the day, how urgent — that the next shop stop reads before the owner
// forgets it, closed by the service that fixed it (or by hand, when it went
// away or was fixed off the log). Three fields and one table; the service
// that closes it is remembered, and deleting that service never reopens it.

const COLUMNS = `issue_id, unit, what, to_char(noticed_on, 'YYYY-MM-DD') AS noticed_on,
  severity, status, closed_by_service_id, to_char(closed_on, 'YYYY-MM-DD') AS closed_on,
  notes, created_at, updated_at`;

export async function getMaintenanceIssues(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const r = await db.query(
    `SELECT ${COLUMNS} FROM maintenance_issues
      WHERE user_id = $1
      ORDER BY (status = 'open') DESC,
               CASE severity WHEN 'now' THEN 0 WHEN 'soon' THEN 1 ELSE 2 END,
               noticed_on ASC, created_at ASC`,
    [user_id],
  );
  return r.rows;
}

export async function createMaintenanceIssue(user_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const { values, errors } = validateIssue(data, { create: true });
  if (errors.length) throw new ValidationError(errors[0]);
  const r = await db.query(
    `INSERT INTO maintenance_issues (user_id, unit, what, noticed_on, severity, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${COLUMNS}`,
    [user_id, values.unit ?? "tractor", values.what, values.noticed_on, values.severity ?? "watch", values.notes ?? null],
  );
  return r.rows[0];
}

export async function patchMaintenanceIssue(user_id, issue_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!issue_id) throw new ValidationError("Missing issue_id");
  const { values, errors } = validateIssue(data, { create: false });
  if (errors.length) throw new ValidationError(errors[0]);
  const updates = [];
  const params = [];
  let i = 1;
  for (const field of ISSUE_FIELDS) {
    if (values[field] !== undefined) {
      updates.push(`${field} = $${i}`);
      params.push(values[field]);
      i++;
    }
  }
  if (updates.length === 0) throw new ValidationError("No valid fields to update");
  updates.push("updated_at = NOW()");
  params.push(issue_id, user_id);
  const r = await db.query(
    `UPDATE maintenance_issues SET ${updates.join(", ")}
      WHERE issue_id = $${i} AND user_id = $${i + 1}
      RETURNING ${COLUMNS}`,
    params,
  );
  if (r.rowCount === 0) throw new NotFoundError("Issue not found");
  return r.rows[0];
}

// Close an issue — by the service that fixed it, or by hand (no service: it
// went away, or was fixed off the log). `runner` lets a service's own
// transaction close the issues it fixes in the same breath.
export async function closeMaintenanceIssue(user_id, issue_id, { service_id = null, closed_on = null } = {}, runner = db) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!issue_id) throw new ValidationError("Missing issue_id");
  const r = await runner.query(
    `UPDATE maintenance_issues
        SET status = 'closed',
            closed_by_service_id = $3,
            closed_on = COALESCE($4::date, CURRENT_DATE),
            updated_at = NOW()
      WHERE issue_id = $1 AND user_id = $2
      RETURNING ${COLUMNS}`,
    [issue_id, user_id, service_id, closed_on],
  );
  if (r.rowCount === 0) throw new NotFoundError("Issue not found");
  return r.rows[0];
}

export async function reopenMaintenanceIssue(user_id, issue_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!issue_id) throw new ValidationError("Missing issue_id");
  const r = await db.query(
    `UPDATE maintenance_issues
        SET status = 'open', closed_by_service_id = NULL, closed_on = NULL, updated_at = NOW()
      WHERE issue_id = $1 AND user_id = $2
      RETURNING ${COLUMNS}`,
    [issue_id, user_id],
  );
  if (r.rowCount === 0) throw new NotFoundError("Issue not found");
  return r.rows[0];
}

export async function deleteMaintenanceIssue(user_id, issue_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!issue_id) throw new ValidationError("Missing issue_id");
  const r = await db.query(
    `DELETE FROM maintenance_issues WHERE issue_id = $1 AND user_id = $2 RETURNING issue_id`,
    [issue_id, user_id],
  );
  if (r.rowCount === 0) throw new NotFoundError("Issue not found");
  return r.rows[0];
}
