-- What the board thought a pay period would hold, written down before it knew.
--
-- Phase 2 of "Does the forecast hold?" (nodded 2026-11-09). Phase 1 shipped as
-- v1.276.0 and measures the typed ASSUMPTIONS against the statements already on
-- the server. This measures the FORECAST itself, which cannot be done
-- retroactively: once a period closes the board reads actuals, and whatever it
-- used to project is gone. So the projection has to be captured while it is
-- still a projection.
--
-- ONE ROW PER PAY PERIOD, AND THE FIRST WRITE WINS. `ON CONFLICT DO NOTHING`
-- is the whole design, not a convenience: a forecast rewritten on the last day
-- of the week would be scored against loads it had already seen land, which is
-- not a forecast, it is a transcript. The number worth scoring is the one the
-- board held the first time it looked.
--
-- THE ASSUMPTIONS RIDE ALONG. Without them a projection made under a $4,647
-- weekly-revenue assumption gets scored against whatever is typed today, and
-- the error means nothing — it would be measuring Jason's edits, not dash's
-- aim. (He is about to change that very figure: phase 1 reads his statements
-- at $5,037 and offers the swap.)
--
-- ACTUALS ARE NOT STORED. They are read live from the settlement feed, the
-- fuel log and his Ops checks, so a corrected statement RE-SCORES the history
-- instead of freezing a wrong answer into it. That is also why this table has
-- no "actual_ending" column, which is the obvious thing to add and the wrong
-- thing to add.
CREATE TABLE IF NOT EXISTS public.forecast_records (
  user_id          uuid        NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  -- The Wednesday the pay period opens — the same key the board uses.
  pay_week_start   date        NOT NULL,
  pay_week_end     date        NOT NULL,
  -- What the board projected for this period, at capture time.
  forecast_ending  numeric(12, 2),
  forecast_deposit numeric(12, 2),
  forecast_fuel    numeric(12, 2),
  -- The four typed figures in force when the projection was made.
  a_weekly_revenue    numeric(12, 2),
  a_weekly_advance    numeric(12, 2),
  a_weekly_deductions numeric(12, 2),
  a_weekly_payroll    numeric(12, 2),
  -- How early the forecast was taken. A projection captured on the Tuesday is
  -- worth less than one captured on the Wednesday, and the panel should be
  -- able to say so rather than quietly averaging them together.
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  days_before_end  integer     NOT NULL,
  PRIMARY KEY (user_id, pay_week_start)
);

ALTER TABLE public.forecast_records ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.forecast_records IS
  'what the cash board projected for a pay period, captured once while it was still a projection (migration 108, 2026-11-10); actuals are never stored — they are read live so a corrected statement re-scores the history';
COMMENT ON COLUMN public.forecast_records.days_before_end IS
  'days between the capture and the period end — how early the forecast was taken';
