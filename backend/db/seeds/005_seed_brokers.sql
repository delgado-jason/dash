-- ============================================================
-- 005_seed_brokers.sql
-- Brokers are scoped per user (unique per user_id + broker_name)
-- Seeding brokers for Jason (user 001) matching real Landstar agencies
-- ============================================================

INSERT INTO brokers (broker_id, user_id, broker_name, phone, email, rating, notes)
VALUES
  (
    'd0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'LLL', '5165550101', 'info@lll-logistics.com', 5,
    'Long Island Logistics - primary agent Mike Sorrentino'
  ),
  (
    'd0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'AGJ', '3125550102', 'info@agj-manifest.com', 4,
    'Manifest Holdings - primary agent Ausra Jaronis'
  ),
  (
    'd0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'BMA', '6155550103', 'info@bma-spectrum.com', 4,
    'Spectrum Transportation - primary agent Hailee Cartwright'
  ),
  (
    'd0000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000001',
    'KJK', '6025550104', NULL, 3,
    'KJK agency - primary agent Jennifer Heggen'
  ),
  (
    'd0000000-0000-0000-0000-000000000005',
    'a0000000-0000-0000-0000-000000000001',
    'Momentum', '9045550105', NULL, NULL,
    'Cold target - Charlie Miltner'
  ),
  -- Brokers for Alice (multi-tenancy test)
  (
    'd0000000-0000-0000-0000-000000000006',
    'a0000000-0000-0000-0000-000000000002',
    'JVL', '2145550106', NULL, 4, NULL
  ),
  -- Brokers for Bob
  (
    'd0000000-0000-0000-0000-000000000007',
    'a0000000-0000-0000-0000-000000000003',
    'FWG', '8175550107', NULL, 3, NULL
  )
ON CONFLICT (broker_id) DO NOTHING;