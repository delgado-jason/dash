-- ============================================================
-- 003_seed_trucks.sql
-- ============================================================

INSERT INTO trucks (
  truck_id,
  user_id,
  unit_number,
  vin,
  plate_number,
  plate_state,
  make,
  model,
  year,
  current_odometer,
  status,
  in_service_date
)
VALUES
  (
    'b0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    '580991',
    '1FUJGLDR9CSBF5809', 'AL4821J', 'AL',
    'Freightliner', 'Cascadia', 2021,
    312450, 'active', '2021-06-15'
  ),
  (
    'b0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000002',
    '1002',
    '1XPBDP9X7KD256789', 'TX7741K', 'TX',
    'Peterbilt', '579', 2020,
    389455, 'active', '2020-03-22'
  ),
  (
    'b0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000003',
    '1003',
    '3HSDZAPR9LN889012', 'TX1129L', 'TX',
    'International', 'LT', 2022,
    112875, 'maintenance', '2022-01-10'
  )
ON CONFLICT (vin) DO NOTHING;