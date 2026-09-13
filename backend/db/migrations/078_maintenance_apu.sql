-- The APU is a fourth unit (decision 4A). Until now maintenance knew a tractor
-- (odometer) and a trailer (hubodometer); the Thermo King TriPac runs on ENGINE
-- HOURS, so it needs its own unit, its own reading, and the `interval_hours`
-- column maintenance_items has carried empty since 026.
--
-- Deliberately NOT created here: an `apu_hour_readings` table. A reading is
-- already a row we keep — an APU service carries the meter at the visit, and a
-- fuel-up can carry one for free (decision 10's cheap capture). The projection
-- in lib/metrics/apuHours.ts reads BOTH sources and takes the newest; a third
-- table would only be a place for the same numbers to disagree.

BEGIN;

-- 1. The unit vocabularies. An ITEM belongs to exactly one unit; a SERVICE
--    (one shop visit / invoice) can cover the truck and trailer together.
ALTER TABLE maintenance_items
  DROP CONSTRAINT IF EXISTS maintenance_items_unit_check;
ALTER TABLE maintenance_items
  ADD CONSTRAINT maintenance_items_unit_check
  CHECK (unit IN ('tractor', 'trailer', 'apu'));

ALTER TABLE maintenance_services
  DROP CONSTRAINT IF EXISTS maintenance_services_unit_check;
ALTER TABLE maintenance_services
  ADD CONSTRAINT maintenance_services_unit_check
  CHECK (unit IN ('tractor', 'trailer', 'both', 'apu'));

-- 2. The hours readings. `apu_hours` on a service is the meter AT THE VISIT;
--    `last_done_hours` on an item is the meter when that item was last done.
--    Both stay NULL until a meter actually gives a number — never 0.
ALTER TABLE maintenance_services ADD COLUMN IF NOT EXISTS apu_hours INTEGER;
ALTER TABLE maintenance_items ADD COLUMN IF NOT EXISTS last_done_hours INTEGER;

-- 3. The cheap capture: an optional hours reading at a fuel-up. He is standing
--    at the truck with the meter in front of him; one box re-anchors the whole
--    projection.
ALTER TABLE fuel_entries ADD COLUMN IF NOT EXISTS apu_hours INTEGER;

-- 4. Data: the two Thermo King visits were filed against the tractor because
--    there was nowhere else to put them (2026-04-23 Mt. Crawford, VA and
--    2026-09-03 Carlisle, PA). They are APU work. `odometer` is left alone —
--    the truck really was at that mileage that day, and that reading is
--    evidence we don't throw away. `apu_hours` stays NULL: nobody wrote the
--    hours down, and a NULL says so where a 0 would lie.
UPDATE maintenance_services
   SET unit = 'apu'
 WHERE vendor ILIKE 'thermo king%';

-- 5. Seed the four TriPac Evolution items for every account that already runs a
--    maintenance schedule (decision 5A). Idempotent by (user_id, name), so a
--    re-run adds nothing. last_done_date is derived per user from that user's
--    own Thermo King services — earliest for the oil & filter (the April PM),
--    latest for the belt & alternator (the September replacement) — and
--    last_done_hours stays NULL: the schedule cannot count hours it was never
--    given, and the UI says "needs a reading" rather than inventing a 0.
INSERT INTO maintenance_items
  (user_id, unit, name, category, interval_miles, interval_months,
   interval_hours, last_done_date, warn_lead_days, truck_id)
SELECT u.user_id,
       'apu',
       s.name,
       'apu',
       NULL,
       s.months,
       s.hours,
       CASE s.anchor
         WHEN 'first' THEN (SELECT MIN(ms.service_date) FROM maintenance_services ms
                             WHERE ms.user_id = u.user_id AND ms.vendor ILIKE 'thermo king%')
         -- ONE visit is the PM and nothing else. With a single Thermo King date
         -- MIN = MAX, and stamping it here would also mark the belt & alternator
         -- "done" off a visit that never touched a belt. The HAVING makes the
         -- subquery return no row (→ NULL) unless there are at least two
         -- DISTINCT dates, so the belt item keeps its honest "never".
         WHEN 'last'  THEN (SELECT MAX(ms.service_date) FROM maintenance_services ms
                             WHERE ms.user_id = u.user_id AND ms.vendor ILIKE 'thermo king%'
                            HAVING COUNT(DISTINCT ms.service_date) > 1)
         ELSE NULL
       END,
       s.warn,
       -- An APU hangs on the one truck; link it only when the account has
       -- exactly one, the same rule resolveFleet() uses in the service layer.
       (SELECT t.truck_id FROM trucks t
         WHERE t.user_id = u.user_id AND t.is_deleted = false
           AND (SELECT COUNT(*) FROM trucks t2
                 WHERE t2.user_id = u.user_id AND t2.is_deleted = false) = 1
         LIMIT 1)
  FROM (SELECT DISTINCT user_id FROM maintenance_items) u
 CROSS JOIN (VALUES
        ('APU oil & filter',        1000, 12,   30, 'first'),
        ('APU belt & alternator',    500, NULL, 14, 'last'),
        ('APU air filter',          1000, NULL, 14, NULL),
        ('APU coolant',             NULL, 24,   14, NULL)
      ) AS s(name, hours, months, warn, anchor)
 WHERE NOT EXISTS (
        SELECT 1 FROM maintenance_items mi
         WHERE mi.user_id = u.user_id AND mi.name = s.name);

-- 6. Link each Thermo King service to the item it completed, so the item has a
--    history and the service shows its ✓ chip. Idempotent via the PK.
--    Only the FIRST and LAST visits can be named from a date alone (the PM and
--    the belt job). With three or more visits the middle ones match neither
--    branch of the CASE, so they stay unlinked rather than being guessed at —
--    the NOTICE at the bottom counts them so nobody has to go looking.
INSERT INTO maintenance_service_items (service_id, item_id)
SELECT ms.service_id, mi.item_id
  FROM maintenance_services ms
  JOIN maintenance_items mi
    ON mi.user_id = ms.user_id
   AND mi.unit = 'apu'
   AND mi.name = CASE
         WHEN ms.service_date = (SELECT MIN(x.service_date) FROM maintenance_services x
                                  WHERE x.user_id = ms.user_id AND x.vendor ILIKE 'thermo king%')
           THEN 'APU oil & filter'
         WHEN ms.service_date = (SELECT MAX(x.service_date) FROM maintenance_services x
                                  WHERE x.user_id = ms.user_id AND x.vendor ILIKE 'thermo king%')
           THEN 'APU belt & alternator'
       END
 WHERE ms.vendor ILIKE 'thermo king%'
   AND NOT EXISTS (
        SELECT 1 FROM maintenance_service_items si
         WHERE si.service_id = ms.service_id AND si.item_id = mi.item_id);

-- No CREATE TABLE here, so RLS is untouched: maintenance_items,
-- maintenance_services, maintenance_service_items and fuel_entries already
-- carry it from their own migrations.

DO $$
DECLARE
  moved    INTEGER;
  seeded   INTEGER;
  linked   INTEGER;
  unlinked INTEGER;
BEGIN
  SELECT COUNT(*) INTO moved  FROM maintenance_services WHERE unit = 'apu';
  SELECT COUNT(*) INTO seeded FROM maintenance_items    WHERE unit = 'apu';
  SELECT COUNT(*) INTO linked FROM maintenance_service_items si
    JOIN maintenance_items mi ON mi.item_id = si.item_id AND mi.unit = 'apu';
  -- Middle visits (neither the first nor the last) are left for a human to
  -- file against the right clock. Counted out loud so they are not silent.
  SELECT COUNT(*) INTO unlinked FROM maintenance_services ms
   WHERE ms.vendor ILIKE 'thermo king%'
     AND NOT EXISTS (SELECT 1 FROM maintenance_service_items si
                       JOIN maintenance_items mi
                         ON mi.item_id = si.item_id AND mi.unit = 'apu'
                      WHERE si.service_id = ms.service_id);
  RAISE NOTICE '078: % services now on the APU', moved;
  RAISE NOTICE '078: % APU schedule items (4 per account with a schedule)', seeded;
  RAISE NOTICE '078: % service→item links on APU items', linked;
  RAISE NOTICE '078: % Thermo King services left unlinked (link them by hand)', unlinked;
END $$;

COMMIT;
