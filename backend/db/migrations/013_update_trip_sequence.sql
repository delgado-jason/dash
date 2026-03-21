BEGIN;

-- 1) Add the new column first, nullable for now so existing rows do not fail
ALTER TABLE trips
ADD COLUMN trip_number INTEGER;

-- 2) Create a sequence owned by trips.trip_number
CREATE SEQUENCE trips_trip_number_seq
START WITH 1
INCREMENT BY 1
OWNED BY trips.trip_number;

-- 3) Set the default so all future inserts auto-generate trip_number
ALTER TABLE trips
ALTER COLUMN trip_number
SET DEFAULT nextval('trips_trip_number_seq');

-- 4) Backfill existing rows with sequential values
WITH numbered_trips AS (
  SELECT trip_id, ROW_NUMBER() OVER (ORDER BY created_at, trip_id) AS seq_num
  FROM trips
)
UPDATE trips
SET trip_number = numbered_trips.seq_num
FROM numbered_trips
WHERE trips.trip_id = numbered_trips.trip_id;

-- 5) Advance the sequence to the current max so the next insert continues correctly
SELECT setval(
  'trips_trip_number_seq',
  COALESCE((SELECT MAX(trip_number) FROM trips), 1),
  true
);

-- 6) Enforce integrity
ALTER TABLE trips
ALTER COLUMN trip_number SET NOT NULL;

ALTER TABLE trips
ADD CONSTRAINT trips_trip_number_unique UNIQUE (trip_number);

COMMIT;