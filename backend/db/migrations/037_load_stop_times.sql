-- In/out times at each stop, so we can track how long a load sits at the
-- shipper and receiver. Stored as bare `time` (no date, no timezone) — the
-- load's existing pickup_date / delivery_date supply the day. All optional.
-- Eventually feeds a "typical load/unload time per agent" metric (duration =
-- out - in, rolling a day when it runs overnight).
ALTER TABLE loads ADD COLUMN IF NOT EXISTS shipper_in time;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS shipper_out time;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS receiver_in time;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS receiver_out time;
