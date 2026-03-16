TRUNCATE trips CASCADE;

INSERT INTO trips (
  user_id,
  truck_id,
  driver_id,
  trip_type,
  trip_source,
  trip_date,
  status,
  odometer_start,
  odometer_end,
  is_estimated
)
SELECT
  u.user_id,
  t.truck_id,
  d.driver_id,
  'revenue',
  'user',
  CURRENT_DATE - INTERVAL '2 days',
  'completed',
  245320,
  245780,
  false
FROM users u
JOIN trucks t ON t.user_id = u.user_id
JOIN drivers d ON d.user_id = u.user_id
WHERE u.email = 'alice@example.com'
LIMIT 1;

INSERT INTO trips (
  user_id,
  truck_id,
  driver_id,
  trip_type,
  trip_source,
  trip_date,
  status,
  odometer_start,
  odometer_end,
  is_estimated
)
SELECT
  u.user_id,
  t.truck_id,
  d.driver_id,
  'revenue',
  'user',
  CURRENT_DATE - INTERVAL '1 day',
  'active',
  389455,
  NULL,
  true
FROM users u
JOIN trucks t ON t.user_id = u.user_id
JOIN drivers d ON d.user_id = u.user_id
WHERE u.email = 'bob@example.com'
LIMIT 1;

INSERT INTO trips (
  user_id,
  truck_id,
  driver_id,
  trip_type,
  trip_source,
  trip_date,
  status,
  odometer_start,
  odometer_end,
  is_estimated
)
SELECT
  u.user_id,
  NULL,
  NULL,
  'revenue',
  'user',
  CURRENT_DATE,
  'planned',
  NULL,
  NULL,
  true
FROM users u
WHERE u.email = 'charlie@example.com';

INSERT INTO trips (
  user_id,
  truck_id,
  driver_id,
  trip_type,
  trip_source,
  trip_date,
  status,
  odometer_start,
  odometer_end,
  is_estimated
)
SELECT
  u.user_id,
  NULL,
  NULL,
  'revenue',
  'user',
  CURRENT_DATE,
  'planned',
  NULL,
  NULL,
  true
FROM users u
WHERE u.email = 'jules@example.com';