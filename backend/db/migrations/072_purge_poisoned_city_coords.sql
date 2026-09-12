-- 072: purge poisoned city_coords rows (coord-cache audit, 2026-09-11).
-- The write-once cache was filled by the plain geocoder behind a state-only
-- validator, so a same-state WRONG place passed and then fed the Foreman's
-- distances for weeks:
--   WALKER, MI   → stored Walker Twp near Mackinac (45.37, -84.47). The real
--                  Walker (Grand Rapids suburb) is 43.008, -85.778 — 180 mi off.
--   HAZELTON, PA → stored Hazelton St, Pittsburgh (40.47, -80.00). The town is
--                  Hazleton (misspelled on loads 6799061 / 1613323) — 230 mi off.
-- Deleting (not flipping to 'failed') lets the fixed writer — city-index
-- prominence, locality-only, twin-refusing — re-resolve each on the next
-- Foreman render.
DELETE FROM city_coords
 WHERE (city_norm, state) IN (('WALKER', 'MI'), ('HAZELTON', 'PA'));

-- "Hazelton" is a misspelling — the town (Johns Manville's plant, load
-- 1613323) is Hazleton, and HERE has no locality "Hazelton, PA", only the
-- Pittsburgh street. Fix the two loads so the city keys cleanly.
UPDATE loads
   SET origin_city = 'Hazleton'
 WHERE origin_city = 'Hazelton' AND origin_state = 'PA';
UPDATE loads
   SET destination_city = 'Hazleton'
 WHERE destination_city = 'Hazelton' AND destination_state = 'PA';
UPDATE agent_coverage
   SET city = 'Hazleton'
 WHERE upper(city) = 'HAZELTON' AND upper(state) = 'PA';
UPDATE facilities
   SET city = 'Hazleton'
 WHERE city = 'Hazelton' AND state = 'PA';

-- The agent's coverage row already spelled it Hazleton, so 071's confirm-by-
-- load never matched it. Same idempotent flip as 071, now that the loads key
-- cleanly (only rows still 'stated' can change).
UPDATE agent_coverage ac
   SET source = 'confirmed',
       confirmed_load_id = m.load_id,
       updated_at = now()
  FROM (
    SELECT DISTINCT ON (l.user_id, l.agent_id, upper(l.origin_city), upper(l.origin_state))
           l.user_id, l.agent_id,
           upper(l.origin_city) AS ucity, upper(l.origin_state) AS ustate,
           l.load_id
      FROM loads l
     WHERE l.agent_id IS NOT NULL
       AND l.origin_city IS NOT NULL
       AND l.origin_state IS NOT NULL
       AND l.load_status <> 'cancelled'
     ORDER BY l.user_id, l.agent_id, upper(l.origin_city), upper(l.origin_state),
              l.delivery_date DESC NULLS LAST
  ) m
 WHERE ac.user_id = m.user_id
   AND ac.agent_id = m.agent_id
   AND upper(ac.city) = m.ucity
   AND upper(ac.state) = m.ustate
   AND ac.source <> 'confirmed';

-- BRUCE TOWNSHIP, MI is a genuine twin — HERE returns "Bruce Twp, MI" twice:
-- Chippewa County in the UP (46.40, -84.32) and Macomb County north of
-- Detroit (42.81, -83.01), 300 mi apart. The cache held the UP one. Load
-- 2760323 (shipper Lanzen, Romeo MI) ran 536 loaded miles to York, PA — the
-- Macomb road distance; the UP one is ~750. The fixed writer refuses twins,
-- so hand-set the proven one instead of leaving it region-level forever.
UPDATE city_coords
   SET lat = 42.81005,
       lng = -83.01232,
       label = 'Bruce Twp (Macomb County), MI — hand-set 2026-09-11 from load 2760323',
       query_score = 1,
       status = 'verified',
       failure_reason = NULL,
       geocoded_at = now()
 WHERE city_norm = 'BRUCE TOWNSHIP' AND state = 'MI';
