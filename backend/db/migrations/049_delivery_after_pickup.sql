-- 049: a load can't deliver before it picks up
--
-- On 2026-07-23 a load was saved with delivery_date 2026-07-14 against a
-- pickup_date of 2026-07-21. That single backwards date parked the load's
-- earnings in the wrong pay week and silently broke three dashboard cards: the
-- grind streak read 8 weeks instead of 1, the current week's earned total went
-- empty, and Recent Loads mis-sorted. The math was right; the input wasn't.
--
-- The API validates this now (validateDateOrder, on both create and patch), but
-- validation only covers the paths that go through it. This constraint is the
-- floor: no route, script, or manual SQL can put the data back into that state.
--
-- delivery_date is nullable — a booked load hasn't delivered yet — so the
-- constraint only applies once it's set.
--
-- Verified before applying: 0 rows violate this in prod.
ALTER TABLE loads
  DROP CONSTRAINT IF EXISTS loads_delivery_after_pickup;

ALTER TABLE loads
  ADD CONSTRAINT loads_delivery_after_pickup
  CHECK (delivery_date IS NULL OR delivery_date >= pickup_date);
