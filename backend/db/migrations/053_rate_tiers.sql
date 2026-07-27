-- Two rate-tier sets (Standard vs Specialized) + a margin goal on the settlement
-- schedule.
--
-- Rate tiers are markup-over-break-even, per driven mile. The load Scorer grades
-- oversize / hazmat / heavy-haul freight against the Specialized set and every-
-- thing else against the Standard set. Seeds are calibrated from Jason's own
-- delivered history (2026-07): standard freight medians ~break-even, specialized
-- medians ~+40% over break-even.
--
-- The margin goal (profit ÷ revenue) drives the weekly/daily REVENUE targets
-- (grind streak, recap, pace bar) and is deliberately INDEPENDENT of the rate
-- tiers. Seed 0.26 reproduces the prior +35%-over-cost weekly target (0.35/1.35).
--
-- ALTER only (no new table) → no RLS statement needed.
ALTER TABLE settlement_schedules
  ADD COLUMN IF NOT EXISTS rate_tier_std_min     numeric NOT NULL DEFAULT 0.10 CHECK (rate_tier_std_min     >= 0 AND rate_tier_std_min     <= 3),
  ADD COLUMN IF NOT EXISTS rate_tier_std_target  numeric NOT NULL DEFAULT 0.20 CHECK (rate_tier_std_target  >= 0 AND rate_tier_std_target  <= 3),
  ADD COLUMN IF NOT EXISTS rate_tier_std_strong  numeric NOT NULL DEFAULT 0.30 CHECK (rate_tier_std_strong  >= 0 AND rate_tier_std_strong  <= 3),
  ADD COLUMN IF NOT EXISTS rate_tier_spec_min    numeric NOT NULL DEFAULT 0.35 CHECK (rate_tier_spec_min    >= 0 AND rate_tier_spec_min    <= 3),
  ADD COLUMN IF NOT EXISTS rate_tier_spec_target numeric NOT NULL DEFAULT 0.45 CHECK (rate_tier_spec_target >= 0 AND rate_tier_spec_target <= 3),
  ADD COLUMN IF NOT EXISTS rate_tier_spec_strong numeric NOT NULL DEFAULT 0.60 CHECK (rate_tier_spec_strong >= 0 AND rate_tier_spec_strong <= 3),
  ADD COLUMN IF NOT EXISTS margin_goal           numeric NOT NULL DEFAULT 0.26 CHECK (margin_goal >= 0 AND margin_goal < 1);
