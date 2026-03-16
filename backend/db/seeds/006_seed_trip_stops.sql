-- Clear existing data (safe for development)
TRUNCATE TABLE trip_stops CASCADE;

-- Alice trip stops
INSERT INTO trip_stops (
  trip_id,
  user_id,
  stop_order,
  stop_type,
  location,
  scheduled_date
)
SELECT
  t.trip_id,
  u.user_id,
  1,
  'pickup',
  'Dallas, TX',
  CURRENT_DATE - INTERVAL '2 days'
FROM trips t
JOIN users u ON t.user_id = u.user_id
WHERE u.email = 'alice@example.com'
LIMIT 1;

INSERT INTO trip_stops (
  trip_id,
  user_id,
  stop_order,
  stop_type,
  location,
  scheduled_date
)
SELECT
  t.trip_id,
  u.user_id,
  2,
  'delivery',
  'Houston, TX',
  CURRENT_DATE - INTERVAL '1 day'
FROM trips t
JOIN users u ON t.user_id = u.user_id
WHERE u.email = 'alice@example.com'
LIMIT 1;


-- Bob trip stops
INSERT INTO trip_stops (
  trip_id,
  user_id,
  stop_order,
  stop_type,
  location,
  scheduled_date
)
SELECT
  t.trip_id,
  u.user_id,
  1,
  'pickup',
  'Atlanta, GA',
  CURRENT_DATE - INTERVAL '1 day'
FROM trips t
JOIN users u ON t.user_id = u.user_id
WHERE u.email = 'bob@example.com'
LIMIT 1;

INSERT INTO trip_stops (
  trip_id,
  user_id,
  stop_order,
  stop_type,
  location,
  scheduled_date
)
SELECT
  t.trip_id,
  u.user_id,
  2,
  'delivery',
  'Nashville, TN',
  CURRENT_DATE
FROM trips t
JOIN users u ON t.user_id = u.user_id
WHERE u.email = 'bob@example.com'
LIMIT 1;


-- Charlie trip stops
INSERT INTO trip_stops (
  trip_id,
  user_id,
  stop_order,
  stop_type,
  location,
  scheduled_date
)
SELECT
  t.trip_id,
  u.user_id,
  1,
  'pickup',
  'Chicago, IL',
  CURRENT_DATE
FROM trips t
JOIN users u ON t.user_id = u.user_id
WHERE u.email = 'charlie@example.com'
LIMIT 1;

INSERT INTO trip_stops (
  trip_id,
  user_id,
  stop_order,
  stop_type,
  location,
  scheduled_date
)
SELECT
  t.trip_id,
  u.user_id,
  2,
  'delivery',
  'Indianapolis, IN',
  CURRENT_DATE + INTERVAL '1 day'
FROM trips t
JOIN users u ON t.user_id = u.user_id
WHERE u.email = 'charlie@example.com'
LIMIT 1;