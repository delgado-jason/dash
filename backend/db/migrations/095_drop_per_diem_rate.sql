-- The undated per-diem rate leaves the schedule (GL-136; general items 5b-i,
-- v1.250.0 / migration 092). per_diem_rates holds the dated rows now, and
-- nothing in the code has named settlement_schedules.per_diem_rate since
-- 5b-i merged (4de660e): the frontend type, the service coerce, the backend
-- DEFAULTS, COLUMNS and validation all dropped it, and the constants contract
-- asserts the key is gone. The column kept its DEFAULT 69 for one release so
-- the running server never met a missing column; this drops it.
-- Backup first: prod-backups/backup-5b-ii-{DEV,PROD}-settlement_schedules.csv.
ALTER TABLE settlement_schedules
    DROP COLUMN IF EXISTS per_diem_rate;
