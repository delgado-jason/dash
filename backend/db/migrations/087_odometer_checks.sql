-- Odometer readings the database refuses (stage 4b, 2026-11-07).
--
-- A reading of 0 is a missing reading, not mile zero (DB-04: 1667237 once
-- started at 0 and the chain read it as 1.6 million empty miles); a window
-- must run forward; deadhead is never negative. Counted against prod on
-- 2026-11-07: 0 violations on every predicate, dev included.
ALTER TABLE loads
  ADD CONSTRAINT loads_odometer_start_positive
    CHECK (odometer_start IS NULL OR odometer_start > 0),
  ADD CONSTRAINT loads_odometer_window_forward
    CHECK (odometer_start IS NULL OR odometer_end IS NULL OR odometer_end > odometer_start),
  ADD CONSTRAINT loads_deadhead_nonneg
    CHECK (deadhead_miles IS NULL OR deadhead_miles >= 0);
ALTER TABLE trips
  ADD CONSTRAINT trips_odometer_window_forward
    CHECK (odometer_start IS NULL OR odometer_end IS NULL OR odometer_end >= odometer_start);
-- A fill-up's reading is a real reading: > 0, not merely >= 0.
ALTER TABLE fuel_entries
  DROP CONSTRAINT fuel_entries_odometer_reading_check,
  ADD CONSTRAINT fuel_entries_odometer_reading_check CHECK (odometer_reading > 0);
