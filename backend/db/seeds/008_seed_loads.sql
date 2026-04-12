-- ============================================================
-- 008_seed_loads.sql
-- Loads for Jason covering multiple statuses, load types,
-- and realistic Landstar BCO lane data.
-- ============================================================

INSERT INTO loads (
  load_id,
  user_id,
  load_number,
  load_type,
  broker_id,
  agent_id,
  origin_city, origin_state,
  destination_city, destination_state,
  origin_market_id,
  destination_market_id,
  pickup_date,
  delivery_date,
  load_status,
  linehaul,
  fuel_surcharge,
  loaded_miles,
  deadhead_miles,
  odometer_start,
  odometer_end,
  mileage_source,
  payment_status,
  shipper_name,
  receiver_name,
  commodity,
  weight
)
VALUES

  -- Load 1: Paid/delivered - LLL agent - Chicago to Nashville
  (
    '10000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'LLL-2881760', 'standard flatbed',
    'd0000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000001',
    'Chicago', 'IL', 'Nashville', 'TN',
    'f0000000-0000-0000-0000-000000000001',
    'f0000000-0000-0000-0000-000000000003',
    CURRENT_DATE - INTERVAL '14 days',
    CURRENT_DATE - INTERVAL '13 days',
    'delivered', 2100.00, 387.00, 480, 22,
    311800, 312302,
    'broker_confirmed', 'paid',
    'ABC Manufacturing', 'Nashville Depot', 'Steel Coils', 42000
  ),

  -- Load 2: Paid/delivered - AGJ agent - Atlanta to Philadelphia (oversize)
  (
    '10000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'AGJ-9012345', 'oversize',
    'd0000000-0000-0000-0000-000000000002',
    'e0000000-0000-0000-0000-000000000002',
    'Atlanta', 'GA', 'Philadelphia', 'PA',
    'f0000000-0000-0000-0000-000000000004',
    'f0000000-0000-0000-0000-000000000010',
    CURRENT_DATE - INTERVAL '10 days',
    CURRENT_DATE - INTERVAL '8 days',
    'delivered', 3400.00, 612.00, 1050, 45,
    312302, 313397,
    'broker_confirmed', 'paid',
    'Crane Works', 'Philadelphia Port', 'Industrial Crane', 68000
  ),

  -- Load 3: Paid/delivered - BMA hazmat - Columbus to Charlotte
  (
    '10000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'BMA-5359618', 'hazmat',
    'd0000000-0000-0000-0000-000000000003',
    'e0000000-0000-0000-0000-000000000003',
    'New Columbia', 'PA', 'Fayetteville', 'NC',
    'f0000000-0000-0000-0000-000000000006',
    'f0000000-0000-0000-0000-000000000007',
    CURRENT_DATE - INTERVAL '7 days',
    CURRENT_DATE - INTERVAL '6 days',
    'delivered', 2283.00, 411.00, 520, 18,
    313397, 313935,
    'broker_confirmed', 'paid',
    'Roofing Supply Co', 'Carolina Dist Center', 'Roofing Materials', 36000
  ),

  -- Load 4: Unpaid/delivered - LLL - Nashville to Dallas
  (
    '10000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000001',
    'LLL-9476094', 'standard flatbed',
    'd0000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000001',
    'Troutman', 'NC', 'Hebron', 'OH',
    'f0000000-0000-0000-0000-000000000007',
    'f0000000-0000-0000-0000-000000000006',
    CURRENT_DATE - INTERVAL '4 days',
    CURRENT_DATE - INTERVAL '3 days',
    'delivered', 3014.00, 542.00, 610, 150,
    313935, 314697,
    'broker_confirmed', 'unpaid',
    'Troutman Industries', 'Hebron Logistics', 'Equipment', 28000
  ),

  -- Load 5: In transit - AGJ - Memphis to Houston (heavy haul)
  (
    '10000000-0000-0000-0000-000000000005',
    'a0000000-0000-0000-0000-000000000001',
    'AGJ-6455657', 'heavy haul',
    'd0000000-0000-0000-0000-000000000002',
    'e0000000-0000-0000-0000-000000000002',
    'West Chester', 'OH', 'Brandywine', 'MD',
    'f0000000-0000-0000-0000-000000000008',
    'f0000000-0000-0000-0000-000000000010',
    CURRENT_DATE - INTERVAL '1 day',
    CURRENT_DATE + INTERVAL '1 day',
    'in_transit', 4000.00, 720.00, 440, 30,
    314697, NULL,
    'broker_confirmed', 'unpaid',
    'Ohio Heavy Equipment', 'Brandywine Yard', 'Excavator', 78000
  ),

  -- Load 6: Booked - KJK - upcoming load
  (
    '10000000-0000-0000-0000-000000000006',
    'a0000000-0000-0000-0000-000000000001',
    'KJK-1100234', 'standard flatbed',
    'd0000000-0000-0000-0000-000000000004',
    'e0000000-0000-0000-0000-000000000004',
    'Charlotte', 'NC', 'Chicago', 'IL',
    'f0000000-0000-0000-0000-000000000007',
    'f0000000-0000-0000-0000-000000000001',
    CURRENT_DATE + INTERVAL '3 days',
    CURRENT_DATE + INTERVAL '4 days',
    'booked', 2800.00, 504.00, 790, 55,
    NULL, NULL,
    'system_estimated', 'unpaid',
    NULL, NULL, 'Machinery', NULL
  ),

  -- Load 7: TONU - cancelled load
  (
    '10000000-0000-0000-0000-000000000007',
    'a0000000-0000-0000-0000-000000000001',
    'LLL-9900001', 'standard flatbed',
    'd0000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000001',
    'Memphis', 'TN', 'Little Rock', 'AR',
    'f0000000-0000-0000-0000-000000000008',
    'f0000000-0000-0000-0000-000000000008',
    CURRENT_DATE - INTERVAL '5 days',
    NULL,
    'tonu', 350.00, 0.00, 0, 0,
    NULL, NULL,
    'user', 'unpaid',
    NULL, NULL, NULL, NULL
  ),

  -- Load 8: Alice - multi-tenancy test load
  (
    '10000000-0000-0000-0000-000000000008',
    'a0000000-0000-0000-0000-000000000002',
    'JVL-5001', 'standard flatbed',
    'd0000000-0000-0000-0000-000000000006',
    'e0000000-0000-0000-0000-000000000006',
    'Dallas', 'TX', 'Houston', 'TX',
    'f0000000-0000-0000-0000-000000000011',
    'f0000000-0000-0000-0000-000000000012',
    CURRENT_DATE - INTERVAL '3 days',
    CURRENT_DATE - INTERVAL '2 days',
    'delivered', 1500.00, 270.00, 240, 0,
    389455, 389700,
    'broker_confirmed', 'paid',
    'Dallas Freight', 'Houston Yard', 'Pipe', 22000
  )

ON CONFLICT (load_id) DO NOTHING;