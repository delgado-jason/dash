-- 050: detention becomes a decision, not an auto-flag
--
-- Detention used to light up automatically whenever a stop's dwell passed the
-- free hours. But whether a shipper actually pays detention is up to the shipper
-- and has to be cleared with the agent — so a long wait isn't the same as money
-- coming. This column records Jason's decision per load:
--   NULL  = undecided → the app recommends asking (a soft "det?" nudge)
--   TRUE  = confirmed with the agent → owed, waiting to collect (the amber flag)
--   FALSE = shipper won't pay → dismissed, no flag
-- detention_paid still marks it collected once the money lands (only meaningful
-- once billable = true).
ALTER TABLE loads
  ADD COLUMN IF NOT EXISTS detention_billable boolean;
