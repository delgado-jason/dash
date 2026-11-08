-- Money writes the database refuses on its own (Nod Sheet "The Protection
-- Stage", stage 4b, 2026-11-07; the plan's dbConstraints, renumbered — 085 is
-- money_day_moves).
--
-- The services now refuse these at the boundary with a sentence; a CHECK is the
-- last line for anything that skips the service (a direct API call, a stale
-- client, a hand-typed row). Every predicate was counted against prod on
-- 2026-11-07: 0 violations, so each one validates existing rows. The one that
-- dev's synthetic data breaks (an active bill with no draft day) is added
-- NOT VALID and validated where it can be, so one file serves both databases.

-- A P&L month is filed when BOTH totals are present; one without the other is
-- a half-filed month that used to shrink the cost basis silently.
ALTER TABLE expense_periods
  ADD CONSTRAINT expense_periods_totals_pair
  CHECK ((cogs_total IS NULL) = (expense_total IS NULL));
-- A P&L month is the 1st — 2026-10-15 would create a second October.
ALTER TABLE expense_periods
  ADD CONSTRAINT expense_periods_first_of_month
  CHECK (period_month = date_trunc('month', period_month)::date);
ALTER TABLE expense_lines
  ADD CONSTRAINT expense_lines_section
  CHECK (section IN ('cogs', 'expenses', 'income'));

-- Tax rates are fractions (15% is 0.15); the planning inputs are never negative.
ALTER TABLE cash_assumptions
  ADD CONSTRAINT cash_assumptions_rates_are_fractions
  CHECK (fed_tax_rate BETWEEN 0 AND 1 AND state_tax_rate BETWEEN 0 AND 1);
ALTER TABLE cash_assumptions
  ADD CONSTRAINT cash_assumptions_nonneg
  CHECK (weekly_payroll >= 0 AND weekly_revenue >= 0 AND weekly_fuel_advance >= 0
         AND weekly_settlement_deductions >= 0 AND monthly_depreciation >= 0
         AND tax_catchup_owed >= 0);

-- A keep is a share: 0–1, and the tractor's share plus the trailer's never
-- exceeds the whole (Jason, P10, 2026-11-05). The 0–2 bounds go.
ALTER TABLE settlement_schedules
  DROP CONSTRAINT settlement_schedules_linehaul_pct_check,
  DROP CONSTRAINT settlement_schedules_trailer_pct_check,
  DROP CONSTRAINT settlement_schedules_fuel_surcharge_pct_check,
  DROP CONSTRAINT settlement_schedules_accessorial_pct_check;
ALTER TABLE settlement_schedules
  ADD CONSTRAINT settlement_schedules_linehaul_pct_check CHECK (linehaul_pct BETWEEN 0 AND 1),
  ADD CONSTRAINT settlement_schedules_trailer_pct_check CHECK (trailer_pct BETWEEN 0 AND 1),
  ADD CONSTRAINT settlement_schedules_fuel_surcharge_pct_check CHECK (fuel_surcharge_pct BETWEEN 0 AND 1),
  ADD CONSTRAINT settlement_schedules_accessorial_pct_check CHECK (accessorial_pct BETWEEN 0 AND 1),
  ADD CONSTRAINT settlement_schedules_shares_le_whole CHECK (linehaul_pct + trailer_pct <= 1);

-- A note's money is never negative; a draw is not a P&L line; an active bill
-- needs its draft day or the money calendar can't place it.
ALTER TABLE obligations
  ADD CONSTRAINT obligations_amount_nonneg CHECK (amount >= 0),
  ADD CONSTRAINT obligations_balances_nonneg
    CHECK ((draft_amount IS NULL OR draft_amount >= 0)
       AND (original_balance IS NULL OR original_balance >= 0)
       AND (current_balance IS NULL OR current_balance >= 0)),
  ADD CONSTRAINT obligations_draw_is_not_pl CHECK (NOT (is_draw AND on_pl));
ALTER TABLE obligations
  ADD CONSTRAINT obligations_active_needs_day
  CHECK (NOT active OR day_of_month IS NOT NULL) NOT VALID;
DO $$
BEGIN
  ALTER TABLE obligations VALIDATE CONSTRAINT obligations_active_needs_day;
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'obligations_active_needs_day left NOT VALID: existing rows violate it (new and changed rows are still held to it)';
END $$;
