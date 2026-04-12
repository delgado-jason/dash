-- ============================================================
-- 002_seed_profiles.sql
-- ============================================================

INSERT INTO profiles (
  user_id,
  first_name,
  last_name,
  phone_num,
  company_name,
  carrier_type,
  owns_trailer,
  home_address,
  home_city,
  home_state
)
VALUES
  (
    'a0000000-0000-0000-0000-000000000001',
    'Jason', 'Delgado', '7277662762',
    'Delgado Trucking Services',
    'Leased Owner Op', TRUE,
    '6205 County Line Rd', 'Leighton', 'AL'
  ),
  (
    'a0000000-0000-0000-0000-000000000002',
    'Alice', 'Reed', '8175550142',
    'Reed Transport LLC',
    'Owner Op', TRUE,
    '410 W 7th St', 'Fort Worth', 'TX'
  ),
  (
    'a0000000-0000-0000-0000-000000000003',
    'Bob', 'Vega', '9725550188',
    'Vega Freight LLC',
    'Leased Owner Op', TRUE,
    '9220 Skillman St', 'Dallas', 'TX'
  ),
  (
    'a0000000-0000-0000-0000-000000000004',
    'Charlie', 'Moss', '6155550177',
    'Moss Hauling',
    'Owner Op', FALSE,
    '300 Broadway', 'Nashville', 'TN'
  ),
  (
    'a0000000-0000-0000-0000-000000000005',
    'Brandie', 'Delgado', '7275550199',
    'Delgado Trucking Services',
    'Leased Owner Op', FALSE,
    '6205 County Line Rd', 'Leighton', 'AL'
  )
ON CONFLICT (user_id) DO NOTHING;