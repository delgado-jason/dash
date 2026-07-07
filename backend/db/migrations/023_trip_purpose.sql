-- 023_add_trip_purpose.sql
-- trips holds only throwaway test data; clearing it lets us add trip_purpose
-- NOT NULL with no default. No DROP: loads & fuel_entries FK into trips.

-- 1) New enum (the ONLY new type — trip_type/source/status already exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trip_purpose') THEN
    CREATE TYPE trip_purpose AS ENUM ('repositioning','home','shop','personal');
  END IF;
END
$$;

-- 2) Clear throwaway test trips (cascades to trip_stops only — verified above)
DELETE FROM trips;

-- 3) Add required column to the now-empty table
ALTER TABLE trips
  ADD COLUMN trip_purpose trip_purpose NOT NULL;

-- 4) (optional) restart trip numbering now that rows are gone
-- ALTER SEQUENCE trips_trip_number_seq RESTART WITH 1;