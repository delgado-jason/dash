-- 059_cuttability.sql
-- Per-category cost-cut tier override for the Market page's cut planner.
-- NULL = the planner auto-classifies the tier from the category name; a value
-- pins it. Lives on expense_category_defaults (already keyed per user+category).
-- RLS is already enabled on that table (042); adding a column inherits it.

DO $$ BEGIN
  CREATE TYPE cut_tier AS ENUM
    ('off_limits', 'essential', 'discretionary', 'deferrable', 'efficiency', 'last_resort');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE expense_category_defaults
  ADD COLUMN IF NOT EXISTS cuttability cut_tier;
