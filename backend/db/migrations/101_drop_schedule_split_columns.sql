-- Retire the undated pay split on settlement_schedules (Q10; general items
-- 5b-iv, v1.253.0 / migration 099).
--
-- APPLY ONLY AFTER v1.253.0 IS DEPLOYED. The code before it still selects
-- these four columns in settlementScheduleServices and joins them in the
-- loads SELECT; dropping them under that server would take every load read
-- down (the 2026-11-08 Fleet-tab outage was exactly this, with
-- trailers.current_hub). From v1.253.0 the split lives in settlement_splits
-- and nothing names these columns.
-- Backup: prod-backups/backup-5b-iv-PROD-settlement_schedules.csv.
ALTER TABLE settlement_schedules
    DROP COLUMN IF EXISTS linehaul_pct,
    DROP COLUMN IF EXISTS trailer_pct,
    DROP COLUMN IF EXISTS fuel_surcharge_pct,
    DROP COLUMN IF EXISTS accessorial_pct;
