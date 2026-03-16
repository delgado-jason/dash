-- Clear existing data (safe during development)
TRUNCATE TABLE loads CASCADE;

-- Alice load
INSERT INTO loads (
  trip_id,
  user_id,
  load_number,
  origin,
  destination,
  pickup_date,
  delivery_date,
  load_status,
  linehaul,
  fuel_surcharge,
  loaded_miles,
  mileage_source,
  payment_status
)
SELECT
  t.trip_id,
  u.user_id,
  'AL-1001',
  'Dallas, TX',
  'Houston, TX',
  CURRENT_DATE - INTERVAL '2 days',
  CURRENT_DATE - INTERVAL '1 day',
  'delivered',
  1500.00,
  300.00,
  240,
  'broker_confirmed',
  'paid'
FROM trips t
JOIN users u ON t.user_id = u.user_id
WHERE u.email = 'alice@example.com'
LIMIT 1;


-- Bob load (currently active)
INSERT INTO loads (
  trip_id,
  user_id,
  load_number,
  origin,
  destination,
  pickup_date,
  delivery_date,
  load_status,
  linehaul,
  fuel_surcharge,
  loaded_miles,
  mileage_source,
  payment_status
)
SELECT
  t.trip_id,
  u.user_id,
  'BO-2001',
  'Atlanta, GA',
  'Nashville, TN',
  CURRENT_DATE - INTERVAL '1 day',
  NULL,
  'in_transit',
  1200.00,
  250.00,
  250,
  'broker_confirmed',
  'unpaid'
FROM trips t
JOIN users u ON t.user_id = u.user_id
WHERE u.email = 'bob@example.com'
LIMIT 1;


-- Charlie load (planned)
INSERT INTO loads (
  trip_id,
  user_id,
  load_number,
  origin,
  destination,
  pickup_date,
  delivery_date,
  load_status,
  linehaul,
  fuel_surcharge,
  loaded_miles,
  mileage_source,
  payment_status
)
SELECT
  t.trip_id,
  u.user_id,
  'CH-3001',
  'Chicago, IL',
  'Indianapolis, IN',
  CURRENT_DATE,
  NULL,
  'booked',
  900.00,
  200.00,
  180,
  'system_estimated',
  'unpaid'
FROM trips t
JOIN users u ON t.user_id = u.user_id
WHERE u.email = 'charlie@example.com'
LIMIT 1;


-- Jules load (TONU example)
INSERT INTO loads (
  trip_id,
  user_id,
  load_number,
  origin,
  destination,
  pickup_date,
  delivery_date,
  load_status,
  linehaul,
  fuel_surcharge,
  loaded_miles,
  mileage_source,
  payment_status
)
SELECT
  t.trip_id,
  u.user_id,
  'JU-4001',
  'Memphis, TN',
  'Little Rock, AR',
  CURRENT_DATE - INTERVAL '3 days',
  NULL,
  'tonu',
  350.00,
  0,
  0,
  'user',
  'unpaid'
FROM trips t
JOIN users u ON t.user_id = u.user_id
WHERE u.email = 'jules@example.com'
LIMIT 1;