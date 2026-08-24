-- Cash-flow planning layer (Jason's spec, 2026-08-24).
--
-- ONE bill list: obligations grows a draft calendar instead of a parallel
-- recurring_bills table (two tables holding the truck note WILL drift).
-- Three consumers, three fields, no double-count:
--   * liquidity (2-week view) drafts COALESCE(draft_amount, amount) on
--     day_of_month — the FULL bank draft;
--   * the Expenses true break-even keeps reading `amount` on rows where
--     on_pl = false — loan rows keep their PRINCIPAL-only amount there
--     (interest is already on the P&L; Jason caught that double-count once);
--   * the 6-month forecast reads neither — interest rides inside net income,
--     principal rides the financing floor (cash_assumptions).
-- on_pl = true marks bills that already sit on the P&L (insurance,
-- subscriptions): they draft cash on the calendar but must NEVER join the
-- break-even sum, which is built from expense records + non-P&L obligations.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'obligation_category') THEN
    CREATE TYPE obligation_category AS ENUM ('loan_lease', 'insurance', 'other');
  END IF;
END
$$;

ALTER TABLE public.obligations
  ADD COLUMN IF NOT EXISTS category obligation_category NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS day_of_month smallint
    CHECK (day_of_month IS NULL OR (day_of_month >= 1 AND day_of_month <= 31)),
  ADD COLUMN IF NOT EXISTS draft_amount numeric(12, 2),
  ADD COLUMN IF NOT EXISTS on_pl boolean NOT NULL DEFAULT false;

-- Existing rows are Jason's break-even loans: amount stays the break-even
-- (principal) figure, draft_amount becomes the full monthly bank draft.
UPDATE public.obligations SET category = 'loan_lease', day_of_month = 26, draft_amount = 1575.00 WHERE label = 'Truck Note';
UPDATE public.obligations SET category = 'loan_lease', day_of_month = 27, draft_amount = 475.19 WHERE label = 'Trailer Payment';
UPDATE public.obligations SET category = 'loan_lease', day_of_month = 19, draft_amount = 358.97 WHERE label = 'Best Egg';

-- The rest of the draft calendar — all already on the P&L (on_pl = true), so
-- the break-even math is untouched by these inserts.
WITH admin_u AS (
  SELECT user_id FROM public.users WHERE role = 'admin' LIMIT 1
)
INSERT INTO public.obligations (user_id, label, amount, active, category, day_of_month, on_pl)
SELECT user_id, b.label, b.amount, true, b.category::obligation_category, b.day, true
FROM admin_u, (VALUES
  ('Health Ins',    380.45, 'insurance',  4),
  ('Dental Ins',     30.44, 'insurance', 20),
  ('Guarantee fee', 900.00, 'other',     27),
  ('Phone',         341.00, 'other',     29),
  ('Prepass',       200.00, 'other',      4),
  ('Internet',      130.00, 'other',     18),
  ('Intuit',        119.23, 'other',      6),
  ('Claude',        100.00, 'other',      7),
  ('Accounting',     75.00, 'other',     15),
  ('Parking',        75.00, 'other',     18),
  ('Hostinger',      24.99, 'other',     17),
  ('Analysis Ch',    20.00, 'other',      9),
  ('Canva',          20.00, 'other',      7),
  ('Railway',        20.00, 'other',     14),
  ('Google',         16.80, 'other',      2)
) AS b(label, amount, category, day)
WHERE NOT EXISTS (
  SELECT 1 FROM public.obligations o
  WHERE o.user_id = admin_u.user_id AND o.label = b.label
);

-- Planning assumptions — one typed row per user (Jason's QBO-derived values).
CREATE TABLE IF NOT EXISTS public.cash_assumptions (
  user_id uuid PRIMARY KEY REFERENCES public.users(user_id) ON DELETE CASCADE,
  weekly_revenue numeric(12, 2) NOT NULL DEFAULT 0,      -- net settlement fallback
  weekly_payroll numeric(12, 2) NOT NULL DEFAULT 0,
  monthly_depreciation numeric(12, 2) NOT NULL DEFAULT 0, -- non-cash add-back
  fed_tax_rate numeric(5, 4) NOT NULL DEFAULT 0,
  state_tax_rate numeric(5, 4) NOT NULL DEFAULT 0,
  financing_floor numeric(12, 2) NOT NULL DEFAULT 0,      -- monthly loan PRINCIPAL (negative)
  tax_catchup_owed numeric(12, 2) NOT NULL DEFAULT 0,     -- display-only earmark
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cash_assumptions ENABLE ROW LEVEL SECURITY;

INSERT INTO public.cash_assumptions
  (user_id, weekly_revenue, weekly_payroll, monthly_depreciation,
   fed_tax_rate, state_tax_rate, financing_floor, tax_catchup_owed)
SELECT user_id, 4647, 1908, 1804.61, 0.15, 0.05, -2318, 10000
FROM public.users WHERE role = 'admin' LIMIT 1
ON CONFLICT (user_id) DO NOTHING;

-- Monthly QBO archive — one row per CLOSED month, permanent, never deleted.
-- A month's net_income already includes depreciation and the cash-flow
-- operating_adjustments already adds it back: they net to zero cash effect.
CREATE TABLE IF NOT EXISTS public.monthly_financials (
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  month date NOT NULL,                                    -- always the 1st
  total_income numeric(14, 2) NOT NULL,
  total_cogs numeric(14, 2) NOT NULL,
  total_opex numeric(14, 2) NOT NULL,
  interest_expense numeric(14, 2) NOT NULL,
  net_income numeric(14, 2) NOT NULL,
  beginning_cash numeric(14, 2) NOT NULL,
  operating_adjustments numeric(14, 2) NOT NULL,
  investing numeric(14, 2) NOT NULL,
  financing numeric(14, 2) NOT NULL,
  ending_cash numeric(14, 2) NOT NULL,
  accounts_receivable numeric(14, 2) NOT NULL,
  total_liabilities numeric(14, 2) NOT NULL,
  total_equity numeric(14, 2) NOT NULL,
  depreciation numeric(14, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, month),
  CONSTRAINT month_is_first CHECK (month = date_trunc('month', month)::date)
);
ALTER TABLE public.monthly_financials ENABLE ROW LEVEL SECURITY;

-- Backfill: Jason's DTS-FINANCIALS.xlsx Data sheet (QBO exports, Jan–Jul 2026;
-- every row's own reconciliation check column was 0.00).
WITH admin_u AS (
  SELECT user_id FROM public.users WHERE role = 'admin' LIMIT 1
)
INSERT INTO public.monthly_financials
  (user_id, month, total_income, total_cogs, total_opex, interest_expense,
   net_income, beginning_cash, operating_adjustments, investing, financing,
   ending_cash, accounts_receivable, total_liabilities, total_equity, depreciation)
SELECT user_id, m.month::date, m.inc, m.cogs, m.opex, m.intr, m.ni, m.beg,
       m.opadj, m.inv, m.fin, m.endc, m.ar, m.liab, m.eq, m.dep
FROM admin_u, (VALUES
  ('2026-01-01', 14013.22, 2028.37,  8454.88, 452.74, 1725.40,  9373.23,   195.61, -108408.09, 102279.36,  5165.51,  1146.00, 105576.67,  5046.32, 1804.61),
  ('2026-02-01', 16557.50, 4184.12,  6690.99, 714.94, 3877.80,  5165.51,  -726.39,       0.00,  -4444.53,  3872.39,  1385.80, 103882.45,  6173.81, 1804.61),
  ('2026-03-01', 25011.52, 6596.12, 12581.93, 680.11, 4028.87,  3872.39,  1060.73,       0.00,  -2229.05,  6732.94,  1433.12, 101457.64,  9702.68, 1804.61),
  ('2026-04-01', 22698.78, 6896.44, 12337.67, 674.25, 1660.09,  6732.94,  6620.18,       0.00,  -3234.91, 11778.30, -3632.50,  99472.68,  9862.77, 1804.61),
  ('2026-05-01', 28833.36, 5776.47, 13033.68, 458.77, 8218.66, 11778.30, -5617.63,       0.00,  -3350.39, 11028.94,  2650.03,  98953.39, 16681.43, 1804.61),
  ('2026-06-01', 27745.72, 4612.26, 18432.70, 257.05, 2896.27, 11028.94,  5771.54,       0.00,  -2793.14, 16903.61, -1068.98,  97533.96, 18577.70, 1804.61),
  ('2026-07-01', 33552.45, 6521.97, 15888.22, 450.54, 9337.69, 16903.61,   431.61,       0.00,  -2317.59, 24355.32,    56.10,  94848.68, 27556.42, 1804.61)
) AS m(month, inc, cogs, opex, intr, ni, beg, opadj, inv, fin, endc, ar, liab, eq, dep)
ON CONFLICT (user_id, month) DO NOTHING;

-- Planned home-time beyond a normal month, per forecast month (Nov = baby).
CREATE TABLE IF NOT EXISTS public.forecast_adjustments (
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  month date NOT NULL,
  weeks_off numeric(4, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, month),
  CONSTRAINT adj_month_is_first CHECK (month = date_trunc('month', month)::date)
);
ALTER TABLE public.forecast_adjustments ENABLE ROW LEVEL SECURITY;

INSERT INTO public.forecast_adjustments (user_id, month, weeks_off)
SELECT user_id, '2026-11-01', 1 FROM public.users WHERE role = 'admin' LIMIT 1
ON CONFLICT (user_id, month) DO NOTHING;
