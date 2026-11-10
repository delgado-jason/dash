-- The moment she tapped, not just the time of day.
--
-- `shipper_in`, `shipper_out`, `receiver_in` and `receiver_out` are all
-- `time without time zone` — "10:00:00" and nothing more. That has been enough
-- to reconstruct a stop after the fact, but it cannot run a clock: a timer
-- counting up from a bare time is right until the arrival was yesterday, and
-- then it is wrong without saying so. It is also why overnight detention has
-- stayed deferred (MONEY_MATH_AUDIT) — the honest version needs arrival DATES
-- and the data never carried them.
--
-- The load console (Nod Sheet "The Load Console", 2026-11-10) fixes that at
-- the source: when Brandie taps "Arrived", dash knows the date, because it is
-- now. These columns hold that full moment.
--
-- Additive on purpose. The time-only columns stay and keep their values; a
-- stamp writes BOTH, so every existing reader — detention, dwell, on-time, the
-- facility ledger, the agent scorecard — carries on untouched. Rows written
-- before today have a time and no stamp, and anything that needs the exact
-- moment refuses on them rather than guessing a date.
ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS shipper_in_at   timestamptz,
  ADD COLUMN IF NOT EXISTS shipper_out_at  timestamptz,
  ADD COLUMN IF NOT EXISTS receiver_in_at  timestamptz,
  ADD COLUMN IF NOT EXISTS receiver_out_at timestamptz;

-- A stop cannot be released before it was reached. NOT VALID so the legacy
-- rows — which have no stamps at all — are left alone; it guards new writes,
-- which is where the console writes.
ALTER TABLE public.loads
  DROP CONSTRAINT IF EXISTS loads_stop_stamps_forward;
ALTER TABLE public.loads
  ADD CONSTRAINT loads_stop_stamps_forward CHECK (
    (shipper_in_at  IS NULL OR shipper_out_at  IS NULL OR shipper_out_at  >= shipper_in_at) AND
    (receiver_in_at IS NULL OR receiver_out_at IS NULL OR receiver_out_at >= receiver_in_at)
  ) NOT VALID;

COMMENT ON COLUMN public.loads.shipper_in_at IS
  'the moment the truck reached the shipper, stamped live from the load console (migration 106, 2026-11-10); the time-only shipper_in is written alongside it';
COMMENT ON COLUMN public.loads.receiver_out_at IS
  'the moment the truck was released by the receiver (migration 106, 2026-11-10)';
