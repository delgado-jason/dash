-- The user's carrier name (e.g. "Landstar"), shown on agent labels and anywhere
-- the carrier is named. NULL for owner-operators on their own authority (no
-- leased carrier), where the app just omits the label.
ALTER TABLE settlement_schedules ADD COLUMN IF NOT EXISTS carrier_name text;
