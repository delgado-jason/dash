-- What a money day MOVED, kept on the snapshot that ran it
-- (Nod Sheet 2026-11-04 "The Numbers, Site-Wide", §4 · 5 and PL-08; stage 2b).
--
-- Until now the only thing dash stored about a money day was the month tag
-- (083's settles_month). The amounts were recomputed from the P&L and the
-- plan's settings every time the page loaded — so a re-uploaded P&L or a
-- changed tax % silently rewrote a month that had already settled, on the
-- Plan page and on the cash board alike. The snapshot now carries the four
-- figures dash ordered that day; the log is still Excel's.
--
-- The one money day before this migration (Oct 1, 2026 · September) keeps
-- NULLs: "not recorded", which the pages say in words — never a backfilled
-- number presented as the record.
ALTER TABLE public.account_snapshots
  ADD COLUMN IF NOT EXISTS tax_moved numeric,        -- % of the month's pre-tax profit, off the top (0 on a loss)
  ADD COLUMN IF NOT EXISTS surplus_moved numeric,    -- everything else that left Ops: the floor fills + the split
  ADD COLUMN IF NOT EXISTS objective_moved numeric,  -- the split's objective half
  ADD COLUMN IF NOT EXISTS household_moved numeric;  -- the split's household half

-- A moved amount belongs to a money day, and money only moves forward.
ALTER TABLE public.account_snapshots DROP CONSTRAINT IF EXISTS account_snapshots_moves_need_month;
ALTER TABLE public.account_snapshots ADD CONSTRAINT account_snapshots_moves_need_month
  CHECK (settles_month IS NOT NULL
         OR (tax_moved IS NULL AND surplus_moved IS NULL AND objective_moved IS NULL AND household_moved IS NULL));
ALTER TABLE public.account_snapshots DROP CONSTRAINT IF EXISTS account_snapshots_moves_nonneg;
ALTER TABLE public.account_snapshots ADD CONSTRAINT account_snapshots_moves_nonneg
  CHECK (coalesce(tax_moved, 0) >= 0 AND coalesce(surplus_moved, 0) >= 0
         AND coalesce(objective_moved, 0) >= 0 AND coalesce(household_moved, 0) >= 0);
