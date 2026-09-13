-- ============================================================
-- 005_seed_agencies.sql
-- Agencies are scoped per user (unique per user_id + agency_code)
-- Seeding agencies for Jason (user 001) matching real Landstar agencies.
-- An agency is the legal name plus its own 3-letter code — the shared desk;
-- 'Momentum' was never a code, so it seeds as JVL · Momentum Transportation.
-- ============================================================

INSERT INTO agencies (agency_id, user_id, agency_code, name, phone, email, rating, notes)
VALUES
  (
    'd0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'LLL', 'Long Island Logistics LLC', '5165550101', 'info@lll-logistics.com', 5,
    'Long Island Logistics - primary agent Mike Sorrentino'
  ),
  (
    'd0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'AGJ', 'Manifest Holdings Group LLC', '3125550102', 'info@agj-manifest.com', 4,
    'Manifest Holdings - primary agent Ausra Jaronis'
  ),
  (
    'd0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'BMA', 'Spectrum Transportation', '6155550103', 'info@bma-spectrum.com', 4,
    'Spectrum Transportation - primary agent Hailee Cartwright'
  ),
  (
    'd0000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000001',
    -- no bill has named this one yet: the code alone, name NULL
    'KJK', NULL, '6025550104', NULL, 3,
    'KJK agency - primary agent Jennifer Heggen'
  ),
  (
    'd0000000-0000-0000-0000-000000000005',
    'a0000000-0000-0000-0000-000000000001',
    'JVL', 'Momentum Transportation', '9045550105', NULL, NULL,
    'Cold target - Charlie Miltner'
  ),
  -- Agencies for Alice (multi-tenancy test) — the code is unique PER USER, so
  -- Alice may hold JVL while Jason does.
  (
    'd0000000-0000-0000-0000-000000000006',
    'a0000000-0000-0000-0000-000000000002',
    'JVL', NULL, '2145550106', NULL, 4, NULL
  ),
  -- Agencies for Bob
  (
    'd0000000-0000-0000-0000-000000000007',
    'a0000000-0000-0000-0000-000000000003',
    'FWG', NULL, '8175550107', NULL, 3, NULL
  )
ON CONFLICT (agency_id) DO NOTHING;
