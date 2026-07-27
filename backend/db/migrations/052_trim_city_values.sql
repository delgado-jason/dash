-- One-time hygiene: strip stray whitespace from city values and normalize state
-- codes (trim + uppercase) that accumulated before city autocomplete existed —
-- e.g. "Ferris " / "Canfield " that were fragmenting lane and agent grouping.
-- Idempotent (re-running is a no-op); no schema change, so no RLS statement.

UPDATE loads SET origin_city = TRIM(origin_city)
  WHERE origin_city <> TRIM(origin_city);
UPDATE loads SET destination_city = TRIM(destination_city)
  WHERE destination_city <> TRIM(destination_city);
UPDATE loads SET origin_state = UPPER(TRIM(origin_state))
  WHERE origin_state <> UPPER(TRIM(origin_state));
UPDATE loads SET destination_state = UPPER(TRIM(destination_state))
  WHERE destination_state <> UPPER(TRIM(destination_state));

UPDATE trips SET start_city = TRIM(start_city)
  WHERE start_city IS NOT NULL AND start_city <> TRIM(start_city);
UPDATE trips SET end_city = TRIM(end_city)
  WHERE end_city IS NOT NULL AND end_city <> TRIM(end_city);
UPDATE trips SET start_state = UPPER(TRIM(start_state))
  WHERE start_state IS NOT NULL AND start_state <> UPPER(TRIM(start_state));
UPDATE trips SET end_state = UPPER(TRIM(end_state))
  WHERE end_state IS NOT NULL AND end_state <> UPPER(TRIM(end_state));

UPDATE fuel_entries SET fuel_city = TRIM(fuel_city)
  WHERE fuel_city IS NOT NULL AND fuel_city <> TRIM(fuel_city);
UPDATE fuel_entries SET fuel_state = UPPER(TRIM(fuel_state))
  WHERE fuel_state IS NOT NULL AND fuel_state <> UPPER(TRIM(fuel_state));

-- Facilities carry UNIQUE(user_id, name, city, state). Only clean rows whose
-- trimmed value wouldn't collide with an existing facility (skip the rare dup).
UPDATE facilities f SET city = TRIM(city), state = UPPER(TRIM(state))
  WHERE (city <> TRIM(city) OR state <> UPPER(TRIM(state)))
    AND NOT EXISTS (
      SELECT 1 FROM facilities g
      WHERE g.user_id = f.user_id AND g.facility_id <> f.facility_id
        AND g.name = f.name
        AND g.city = TRIM(f.city)
        AND g.state = UPPER(TRIM(f.state))
    );
