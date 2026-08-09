-- Day of week the carrier's weekly settlement lands (0 = Sunday … 6 = Saturday).
-- Landstar pays Jason on Wednesdays; the default matches. Surfaced on the
-- dashboard ("next settlement lands Wed Aug 12") and editable on Settings.
ALTER TABLE settlement_schedules
  ADD COLUMN settlement_day smallint NOT NULL DEFAULT 3;
