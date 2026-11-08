-- Retire trailers.current_hub (GL-07; general items 5b-iii, v1.252.0).
--
-- APPLY ONLY AFTER v1.252.0 IS DEPLOYED. The code at ee58535 (v1.251.0) still
-- selects this column; dropping it under that server took the Fleet tab down
-- on 2026-11-08 ("No truck yet") until the column was re-added by hand with
-- its backed-up value (456,123 on prod). From v1.252.0 nothing names it: the
-- trailer type, the service SELECT/ALLOWED lists, the Fleet form and the pages
-- all read the truck's odometer through lib/metrics/trailerMeter.ts.
-- Backup: prod-backups/backup-5b-iii-PROD-trailers.csv.
ALTER TABLE trailers
    DROP COLUMN IF EXISTS current_hub;
