-- A maintenance service (shop visit / invoice) can cover the truck, the
-- trailer, or BOTH. The truck odometer and trailer hubodometer are different
-- readings, so add a second reading (`trailer_hub`) and allow unit = 'both'.
-- `odometer` now always means the truck reading; `trailer_hub` the trailer
-- reading. Existing trailer-only services move their reading across.

ALTER TABLE maintenance_services ADD COLUMN IF NOT EXISTS trailer_hub INTEGER;

UPDATE maintenance_services
  SET trailer_hub = odometer, odometer = NULL
  WHERE unit = 'trailer' AND trailer_hub IS NULL;

ALTER TABLE maintenance_services
  DROP CONSTRAINT IF EXISTS maintenance_services_unit_check;
ALTER TABLE maintenance_services
  ADD CONSTRAINT maintenance_services_unit_check
  CHECK (unit IN ('tractor', 'trailer', 'both'));
