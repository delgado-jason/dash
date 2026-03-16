-- Clear existing data (safe during development)
TRUNCATE TABLE fuel_entries CASCADE;

-- Alice fuel entry
INSERT INTO fuel_entries (
  user_id,
  truck_id,
  trip_id,
  fuel_date,
  gallons,
  price_per_gallon,
  odometer_reading,
  company_name,
  fuel_city,
  fuel_state
)
SELECT
  u.user_id,
  t.truck_id,
  tr.trip_id,
  CURRENT_DATE - INTERVAL '2 days',
  125.500,
  3.859,
  245450,
  'Pilot',
  'Dallas',
  'TX'
FROM users u
JOIN trucks t ON t.user_id = u.user_id
LEFT JOIN trips tr ON tr.user_id = u.user_id
WHERE u.email = 'alice@example.com'
LIMIT 1;


-- Bob fuel entry
INSERT INTO fuel_entries (
  user_id,
  truck_id,
  trip_id,
  fuel_date,
  gallons,
  price_per_gallon,
  odometer_reading,
  company_name,
  fuel_city,
  fuel_state
)
SELECT
  u.user_id,
  t.truck_id,
  tr.trip_id,
  CURRENT_DATE - INTERVAL '1 day',
  110.250,
  3.799,
  389600,
  'Love''s',
  'Atlanta',
  'GA'
FROM users u
JOIN trucks t ON t.user_id = u.user_id
LEFT JOIN trips tr ON tr.user_id = u.user_id
WHERE u.email = 'bob@example.com'
LIMIT 1;


-- Brandie fuel entry (no trip assigned yet)
INSERT INTO fuel_entries (
  user_id,
  truck_id,
  trip_id,
  fuel_date,
  gallons,
  price_per_gallon,
  odometer_reading,
  company_name,
  fuel_city,
  fuel_state
)
SELECT
  u.user_id,
  t.truck_id,
  NULL,
  CURRENT_DATE,
  95.000,
  3.699,
  112950,
  'TA',
  'St. Louis',
  'MO'
FROM users u
JOIN trucks t ON t.user_id = u.user_id
WHERE u.email = 'brandie@example.com'
LIMIT 1;