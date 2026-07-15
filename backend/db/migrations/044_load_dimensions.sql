-- Structured load dimensions (the cargo's own size), replacing the free-text
-- `dimensions` column so oversize achievements can compute widest/tallest/longest.
-- Stored as whole inches; the UI enters feet + inches. Nullable — a legal load has
-- none. Weight already lives in its own integer column and is unchanged.
--
-- Expand/contract: this migration ADDS the structured columns and backfills the
-- existing free-text values. The old `dimensions` column is dropped in migration
-- 045, applied only AFTER the new backend (which no longer selects it) is live, so
-- no running query ever references a dropped column.
ALTER TABLE loads
  ADD COLUMN IF NOT EXISTS length_in integer CHECK (length_in IS NULL OR length_in > 0),
  ADD COLUMN IF NOT EXISTS width_in  integer CHECK (width_in  IS NULL OR width_in  > 0),
  ADD COLUMN IF NOT EXISTS height_in integer CHECK (height_in IS NULL OR height_in > 0);

-- Backfill the 7 existing dimensioned loads, hand-converted from their free-text
-- values to inches in L × W × H order (the formats were inconsistent, so this was
-- mapped by hand rather than parsed).
UPDATE loads SET length_in = 617, width_in = 156, height_in = 43 WHERE load_number = '3165710';
UPDATE loads SET length_in = 480, width_in = 124, height_in = 36 WHERE load_number = '5649273';
UPDATE loads SET length_in = 300, width_in = 120, height_in = 72 WHERE load_number = '6546647';
UPDATE loads SET length_in = 480, width_in = 148, height_in = 94 WHERE load_number = '7413468';
UPDATE loads SET length_in = 595, width_in = 132, height_in = 72 WHERE load_number = '7751754';
UPDATE loads SET length_in = 300, width_in = 121, height_in = 81 WHERE load_number = '9476094';
UPDATE loads SET length_in = 481, width_in = 126, height_in = 61 WHERE load_number = '9960798';
