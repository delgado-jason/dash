-- Hometime threshold: the driver page flags when the days since your most recent
-- "home" mark on the per-diem calendar exceed this. A per-user preference, so it
-- rides on the settlement_schedules row — already the de-facto user-settings table
-- (detention-free hours, per-diem rate live here too). RLS is already enabled on
-- this table (migration 042); no policy needed (backend connects as owner).
ALTER TABLE settlement_schedules
  ADD COLUMN IF NOT EXISTS hometime_threshold_days integer NOT NULL DEFAULT 21
    CHECK (hometime_threshold_days >= 1 AND hometime_threshold_days <= 365);
