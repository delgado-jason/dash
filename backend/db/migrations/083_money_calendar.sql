-- The Money Calendar — ADMIN-03 · Owner distributions read into the Plan page
-- (Nod Sheet rev 2, 2026-09-22, all leans; issue #500).
--
-- The plan row carries the rate table, the floors and the split as SETTINGS,
-- so 2027 keeps what it said and 2028 starts from the new numbers. The weekly
-- pair (maintenance_weekly, tax_weekly) stays on the row for history, unused.
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS maintenance_per_mile numeric NOT NULL DEFAULT 0.32,    -- $ per mile driven, accrued every Friday
  ADD COLUMN IF NOT EXISTS tax_pct numeric NOT NULL DEFAULT 20,                   -- % of the month's pre-tax profit, off the top
  ADD COLUMN IF NOT EXISTS maintenance_floor numeric NOT NULL DEFAULT 5000,       -- floor 2 of the interlock (proposed, editable)
  ADD COLUMN IF NOT EXISTS min_move numeric NOT NULL DEFAULT 500,                 -- under it nothing moves
  ADD COLUMN IF NOT EXISTS objective_pct numeric NOT NULL DEFAULT 70,             -- the split; household gets the rest
  ADD COLUMN IF NOT EXISTS first_money_month date NOT NULL DEFAULT '2026-08-01';  -- the first month under these rules

-- The interlock needs to know WHICH reserve is the working minimum and which
-- one takes the tax move: two more roles. Rows keep 'reserve' unless named.
ALTER TABLE public.plan_accounts DROP CONSTRAINT IF EXISTS plan_accounts_role_check;
ALTER TABLE public.plan_accounts ADD CONSTRAINT plan_accounts_role_check
  CHECK (role IN ('ops', 'vault', 'maintenance', 'tax', 'reserve'));
UPDATE public.plan_accounts SET role = 'maintenance' WHERE role = 'reserve' AND lower(name) = 'maintenance';
UPDATE public.plan_accounts SET role = 'tax' WHERE role = 'reserve' AND lower(name) = 'tax';

-- A snapshot carries the accrual it made (the miles and the pay week they
-- covered — a closed pay week accrues once, on the first snapshot after it
-- closes) and, on a money day, the month it settled. That tag is the ONLY
-- thing dash stores about a money day; the log is Excel's.
ALTER TABLE public.account_snapshots
  ADD COLUMN IF NOT EXISTS miles numeric,
  ADD COLUMN IF NOT EXISTS pay_week_start date,
  ADD COLUMN IF NOT EXISTS settles_month date;
CREATE UNIQUE INDEX IF NOT EXISTS account_snapshots_settles_month_key
  ON public.account_snapshots (user_id, settles_month)
  WHERE settles_month IS NOT NULL;
