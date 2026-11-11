import { db } from "../../db/pool.js";
import { ValidationError } from "../utils/error.js";

const isDay = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

// A money figure or null. A blank is NOT zero here: the board refuses to
// project a line whose planning input is missing, and a refusal recorded as
// $0 would later score as a wildly wrong forecast instead of as no forecast.
const money = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ---- GET every recorded forecast ---- (newest period first)
export async function getForecastRecords(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT to_char(pay_week_start, 'YYYY-MM-DD') AS pay_week_start,
            to_char(pay_week_end, 'YYYY-MM-DD')   AS pay_week_end,
            forecast_ending, forecast_deposit, forecast_fuel,
            a_weekly_revenue, a_weekly_advance, a_weekly_deductions, a_weekly_payroll,
            recorded_at, days_before_end
       FROM forecast_records
      WHERE user_id = $1
      ORDER BY pay_week_start DESC`,
    [user_id],
  );
  return result.rows;
}

// ---- RECORD a projection, ONCE ----
//
// `ON CONFLICT DO NOTHING` is the design, not a convenience. A forecast
// rewritten later in the week would be scored against loads it had already
// watched land — a transcript, not a forecast. The first capture is the one
// worth keeping, so a second call for the same period is a no-op and says so.
export async function recordForecast(user_id, body) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const { pay_week_start, pay_week_end } = body ?? {};
  if (!isDay(pay_week_start)) throw new ValidationError("pay_week_start must be YYYY-MM-DD");
  if (!isDay(pay_week_end)) throw new ValidationError("pay_week_end must be YYYY-MM-DD");
  if (pay_week_end < pay_week_start)
    throw new ValidationError("pay_week_end cannot precede pay_week_start");

  const days = Number(body?.days_before_end);
  if (!Number.isInteger(days)) throw new ValidationError("days_before_end must be a whole number");
  // A projection captured AFTER the period closed is not a forecast. The
  // client should never send one; refusing by name beats storing a transcript.
  if (days < 0) throw new ValidationError("a period that has already closed cannot be forecast");

  const result = await db.query(
    `INSERT INTO forecast_records (
       user_id, pay_week_start, pay_week_end,
       forecast_ending, forecast_deposit, forecast_fuel,
       a_weekly_revenue, a_weekly_advance, a_weekly_deductions, a_weekly_payroll,
       days_before_end)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (user_id, pay_week_start) DO NOTHING
     RETURNING to_char(pay_week_start, 'YYYY-MM-DD') AS pay_week_start`,
    [
      user_id, pay_week_start, pay_week_end,
      money(body.forecast_ending), money(body.forecast_deposit), money(body.forecast_fuel),
      money(body.a_weekly_revenue), money(body.a_weekly_advance),
      money(body.a_weekly_deductions), money(body.a_weekly_payroll),
      days,
    ],
  );
  // `recorded: false` means one was already held — the honest answer, and the
  // client uses it to stop asking.
  return { recorded: result.rowCount > 0, pay_week_start };
}
