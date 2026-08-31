-- Settlement holdbacks (Jason, 2026-08-31): the weekly fuel advance (~$2,000
-- drawn against revenue — it fuels the truck via the card and never lands in
-- the bank, so the Wednesday settlement arrives short by it) and the average
-- per-settlement deductions (Landstar's weekly withholdings — insurance,
-- trailer plan, ELD…). Both are ASSUMPTIONS: dash holds no per-settlement
-- statement data to derive the deduction average from, so Jason averages a
-- few statements and keeps the number here. The 2-week liquidity view
-- subtracts both from every projected settlement week (never from a manual
-- override — an override is the landed net already).
ALTER TABLE public.cash_assumptions
  ADD COLUMN IF NOT EXISTS weekly_fuel_advance numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekly_settlement_deductions numeric(12, 2) NOT NULL DEFAULT 0;

UPDATE public.cash_assumptions
SET weekly_fuel_advance = 2000
WHERE user_id = (SELECT user_id FROM public.users WHERE role = 'admin' LIMIT 1);
