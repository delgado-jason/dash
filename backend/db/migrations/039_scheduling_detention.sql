-- Scheduled pickup/delivery times + detention/TONU pay tracking.
--
-- Appointments: each stop gets a start + optional end (bare `time`, paired with
-- the load's pickup/delivery date). End NULL → a set appointment at start; end
-- present → a window [start, end]. On-time is derived from these vs the actual
-- arrival (shipper_in / receiver_in) from migration 037.
ALTER TABLE loads ADD COLUMN IF NOT EXISTS pickup_appt_start time;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS pickup_appt_end time;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS delivery_appt_start time;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS delivery_appt_end time;

-- Detention/TONU are money owed until collected. "Owed" is derived (dwell past
-- the free window / a TONU load); "paid" is a manual mark that clears the flag.
ALTER TABLE loads ADD COLUMN IF NOT EXISTS detention_paid boolean NOT NULL DEFAULT false;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS tonu_paid boolean NOT NULL DEFAULT false;

-- Free time before detention accrues, per stop — a per-user setting. Defaults to
-- 3 hours (Jason's standard); editable on the settings page.
ALTER TABLE settlement_schedules
    ADD COLUMN IF NOT EXISTS detention_free_hours numeric(4,2) NOT NULL DEFAULT 3;
