-- ============================================================
-- 010_seed_fuel_entries.sql
-- Fuel entries tied to Jason's truck. trip_id left null (dormant).
-- ============================================================

INSERT INTO fuel_entries (
  fuel_entry_id,
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
VALUES
  (
    'a8800000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    NULL,
    CURRENT_DATE - INTERVAL '13 days',
    98.4, 5.64, 311850,
    'Pilot', 'Nashville', 'TN'
  ),
  (
    'a8800000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    NULL,
    CURRENT_DATE - INTERVAL '11 days',
    112.7, 5.71, 312100,
    'Love''s', 'Cookeville', 'TN'
  ),
  (
    'a8800000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    NULL,
    CURRENT_DATE - INTERVAL '8 days',
    89.2, 5.58, 312580,
    'TA', 'Atlanta', 'GA'
  ),
  (
    'a8800000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    NULL,
    CURRENT_DATE - INTERVAL '5 days',
    103.6, 5.64, 313200,
    'Pilot', 'Columbia', 'SC'
  ),
  (
    'a8800000-0000-0000-0000-000000000005',
    'a0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    NULL,
    CURRENT_DATE - INTERVAL '2 days',
    95.1, 5.69, 313800,
    'Love''s', 'Akron', 'OH'
  )
ON CONFLICT (fuel_entry_id) DO NOTHING;