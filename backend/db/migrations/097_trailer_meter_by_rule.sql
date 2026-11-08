-- The truck's odometer is the trailer's meter, by rule (Jason's call, Nod
-- Sheet "The Numbers, Site-Wide" GL-07, 2026-11-05: "My trailer doesn't have
-- a hub odometer on it … use my truck odometer to track as my trailer hub
-- odometer" → "Yes, truck odometer by rule"; "General Items" Nod Sheet mock 4,
-- call 4 lean A nodded 2026-11-07: a trailer service pre-fills the truck's
-- last reading on or before the service date and names its source).
--
-- The trailer's reading today is the truck's latest reading (fills, loads,
-- trips, services), and a service's trailer_hub is the truck's odometer on
-- that date — the one scale. maintenance_services.trailer_hub keeps its name
-- (the trailer unit's reading at service time) and is now always in
-- truck-odometer miles: a "both" service carries one reading, so its
-- trailer_hub is its odometer.
--
-- Prod 2026-11-08: four "both" rows already carry trailer_hub = odometer;
-- three carry an odometer and no trailer_hub (Jul 2, Aug 20, Oct 7) and are
-- filled by the rule; one (Jul 28, a truck wash) has neither; the one
-- "trailer" row (Sep 13) was set to the truck's 599,431 on Nov 6.
-- Backups: prod-backups/backup-5b-iii-{DEV,PROD}-{trailers,maintenance_services}.csv.
--
-- trailers.current_hub (the seed of a hub scale the trailer never had — 456,123
-- against a truck at 606,217) is retired by migration 098, which runs only
-- AFTER the code that stops naming the column is deployed. The first cut of
-- this file dropped it here, before that deploy; the live server's trailer
-- SELECT failed and the Fleet tab read "No truck yet" until the column was
-- re-added by hand with its backed-up value (2026-11-08). A DROP waits for
-- the deploy; only additive changes go first.
UPDATE maintenance_services
   SET trailer_hub = odometer
 WHERE unit = 'both' AND trailer_hub IS NULL AND odometer IS NOT NULL;

-- One reading per "both" service, from here on. NOT VALID + validate so a dev
-- row that disagrees keeps the constraint on the books without blocking.
ALTER TABLE maintenance_services
    DROP CONSTRAINT IF EXISTS maintenance_services_both_one_meter;
ALTER TABLE maintenance_services
    ADD CONSTRAINT maintenance_services_both_one_meter
    CHECK (unit <> 'both' OR trailer_hub IS NULL OR odometer IS NULL OR trailer_hub = odometer) NOT VALID;
DO $$
BEGIN
  ALTER TABLE maintenance_services VALIDATE CONSTRAINT maintenance_services_both_one_meter;
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'maintenance_services_both_one_meter left NOT VALID: existing rows disagree';
END $$;
