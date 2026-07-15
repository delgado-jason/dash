-- Contract step for the dimensions restructure (see migration 044). Drops the old
-- free-text `dimensions` column now that its data is preserved in length_in /
-- width_in / height_in.
--
-- Apply ONLY after the backend that no longer selects `dimensions` is deployed, so
-- live queries never reference a dropped column (an expand/contract deploy).
ALTER TABLE loads DROP COLUMN IF EXISTS dimensions;
