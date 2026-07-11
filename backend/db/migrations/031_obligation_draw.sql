-- Owner draws (distributions) are not a business cost — they're profit taken
-- out. Flag them so True Net can exclude them (a draw is a distribution of
-- profit, not a cost), while the break-even / rate math still counts them as
-- cash the owner needs to cover.
ALTER TABLE obligations ADD COLUMN IF NOT EXISTS is_draw boolean NOT NULL DEFAULT false;

-- Backfill: mark existing distribution / draw rows.
UPDATE obligations
SET is_draw = true
WHERE is_draw = false
  AND (label ILIKE '%distribution%' OR label ILIKE '%draw%' OR label ILIKE '%owner pay%');
