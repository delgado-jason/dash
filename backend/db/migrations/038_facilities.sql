-- Real, location-keyed facilities (shippers/receivers). A single location both
-- ships and receives, so one table; a load references it as shipper and/or
-- receiver. Identity is name + city + state, so "Walmart · St. Louis, MO" and
-- "Walmart · Ocala, FL" stay distinct records. Address is optional (disambiguates
-- the rare two-DCs-in-one-metro case, and helps the driver).
CREATE TABLE IF NOT EXISTS facilities (
    facility_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name VARCHAR(80) NOT NULL,
    city VARCHAR(50) NOT NULL,
    state CHAR(2) NOT NULL,
    address VARCHAR(120) NULL,
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_facility_per_user UNIQUE (user_id, name, city, state)
);

-- A load links to its shipper and receiver facilities. Nullable (older loads,
-- or ones entered without a facility). ON DELETE SET NULL — deleting a facility
-- doesn't take loads with it; they just lose the link.
ALTER TABLE loads ADD COLUMN IF NOT EXISTS shipper_facility_id UUID NULL
    REFERENCES facilities(facility_id) ON DELETE SET NULL;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS receiver_facility_id UUID NULL
    REFERENCES facilities(facility_id) ON DELETE SET NULL;

-- Backfill: create a facility for each distinct shipper (name + origin) and
-- receiver (name + destination) on existing loads, then link the loads. The
-- shipper sits at the origin and the receiver at the destination, so origin/
-- destination city+state are the facility's location.
INSERT INTO facilities (user_id, name, city, state)
SELECT DISTINCT user_id, shipper_name, origin_city, origin_state
FROM loads
WHERE shipper_name IS NOT NULL AND shipper_name <> ''
ON CONFLICT (user_id, name, city, state) DO NOTHING;

INSERT INTO facilities (user_id, name, city, state)
SELECT DISTINCT user_id, receiver_name, destination_city, destination_state
FROM loads
WHERE receiver_name IS NOT NULL AND receiver_name <> ''
ON CONFLICT (user_id, name, city, state) DO NOTHING;

UPDATE loads l SET shipper_facility_id = f.facility_id
FROM facilities f
WHERE f.user_id = l.user_id
  AND f.name = l.shipper_name
  AND f.city = l.origin_city
  AND f.state = l.origin_state
  AND l.shipper_name IS NOT NULL;

UPDATE loads l SET receiver_facility_id = f.facility_id
FROM facilities f
WHERE f.user_id = l.user_id
  AND f.name = l.receiver_name
  AND f.city = l.destination_city
  AND f.state = l.destination_state
  AND l.receiver_name IS NOT NULL;
