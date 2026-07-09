-- Expense (P&L) data model for the Expenses page / cost → net-profit arc.
-- One expense_period per uploaded month; expense_lines are its classified
-- categories; expense_category_defaults remembers each category's
-- fixed/variable classification so future (single-month) uploads come in
-- pre-sorted the way Jason last set them.

-- fixed / variable enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'expense_type') THEN
    CREATE TYPE expense_type AS ENUM ('fixed', 'variable');
  END IF;
END
$$;

-- One row per uploaded month. Money as NUMERIC (serializes as strings in JSON
-- → coerce before math on the JS side).
CREATE TABLE IF NOT EXISTS expense_periods (
    period_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    period_month DATE NOT NULL,        -- first of the month, e.g. 2026-06-01
    period_label VARCHAR(20),          -- "Jun 2026" from the P&L header
    income_total NUMERIC(12, 2),
    cogs_total NUMERIC(12, 2),
    expense_total NUMERIC(12, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- re-uploading a month replaces it (upsert on this key)
    CONSTRAINT unique_period_per_user UNIQUE (user_id, period_month)
);

-- Classified line items for a period.
CREATE TABLE IF NOT EXISTS expense_lines (
    line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id UUID NOT NULL
        REFERENCES expense_periods(period_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    type EXPENSE_TYPE NOT NULL,
    section VARCHAR(10) NOT NULL DEFAULT 'expenses', -- 'cogs' | 'expenses'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Remembered fixed/variable per category → future uploads auto-classify.
CREATE TABLE IF NOT EXISTS expense_category_defaults (
    default_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    type EXPENSE_TYPE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_category_default_per_user UNIQUE (user_id, category)
);

CREATE INDEX IF NOT EXISTS idx_expense_lines_period ON expense_lines(period_id);
