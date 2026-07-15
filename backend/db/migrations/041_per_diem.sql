-- Per-diem (M&IE) day tracking. One row per day the user MARKS by hand:
-- 'full' (full day out), 'half' (departure/return day, 75%), or 'home' (an
-- explicit "I was home" that overrides an inferred out-day). Days with NO row
-- are inferred live from delivered loads (covered by a pickup->delivery span) for
-- the year-to-date, else treated as home. Keeps the table to just manual marks.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'per_diem_status') THEN
    CREATE TYPE per_diem_status AS ENUM ('full', 'half', 'home');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS per_diem_days (
    per_diem_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    day DATE NOT NULL,
    status per_diem_status NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_per_diem_day UNIQUE (user_id, day)
);

-- The IRS special M&IE rate (updates each Oct) and the DOT deductible share
-- (80% for hours-of-service drivers). Per-user settings, editable on Settings.
ALTER TABLE settlement_schedules
    ADD COLUMN IF NOT EXISTS per_diem_rate numeric(6,2) NOT NULL DEFAULT 69;
ALTER TABLE settlement_schedules
    ADD COLUMN IF NOT EXISTS per_diem_deduct_pct numeric(4,3) NOT NULL DEFAULT 0.80;
