
-- ALTER TABLE trip_stops
-- DROP COLUMN location;

-- ALTER TABLE trip_stops
-- ADD COLUMN stop_city VARCHAR(50) NULL;

-- ALTER TABLE trip_stops
-- ADD COLUMN stop_state CHAR(2) NULL;

ALTER TABLE trip_stops
ALTER COLUMN stop_city SET NOT NULL;

ALTER TABLE trip_stops
ALTER COLUMN stop_state SET NOT NULL;