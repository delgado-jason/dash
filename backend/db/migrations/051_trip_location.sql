-- Trips now record WHERE the truck went, not just how far. start_/end_ city+state
-- let a completed trip advance the truck's last-known location — loads and fuel
-- already stamp it; trips were the blind spot (deadhead home, repositioning).
-- All nullable: existing trips have none, and a quick trip can still be logged
-- bare. ALTER only (no new table) → no RLS statement required.

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS start_city VARCHAR(50),
  ADD COLUMN IF NOT EXISTS start_state CHAR(2),
  ADD COLUMN IF NOT EXISTS end_city VARCHAR(50),
  ADD COLUMN IF NOT EXISTS end_state CHAR(2);
