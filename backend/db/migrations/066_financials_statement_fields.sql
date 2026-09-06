-- 066: statement-feed fields (2026-09-06). The QBO parser captures more
-- than the 15-column paste ever could; these unlock the current-ratio tile
-- and exact DSCR on THE BOOKS. Nullable: paste-era rows simply lack them.

ALTER TABLE public.monthly_financials
  ADD COLUMN IF NOT EXISTS total_current_assets numeric(14,2),
  ADD COLUMN IF NOT EXISTS total_current_liabilities numeric(14,2),
  ADD COLUMN IF NOT EXISTS total_assets numeric(14,2),
  ADD COLUMN IF NOT EXISTS loan_proceeds numeric(14,2),
  ADD COLUMN IF NOT EXISTS principal_repayments numeric(14,2);
