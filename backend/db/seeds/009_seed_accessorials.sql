-- ============================================================
-- 009_seed_accessorials.sql
-- Extra charges tied to specific loads
-- ============================================================

INSERT INTO accessorials (accessorial_id, load_id, user_id, accessorial_type, amount)
VALUES
  -- Oversize permit fee on load 2 (Atlanta -> Philadelphia oversize)
  (
    'a9900000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'Oversize Permit', 225.00
  ),
  -- Escort fee on load 2
  (
    'a9900000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'Escort Fee', 400.00
  ),
  -- Hazmat fee on load 3 (BMA hazmat load)
  (
    'a9900000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'Hazmat Fee', 150.00
  ),
  -- Layover on load 4
  (
    'a9900000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000001',
    'Layover', 200.00
  ),
  -- Oversize permit on load 5 (heavy haul)
  (
    'a9900000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000005',
    'a0000000-0000-0000-0000-000000000001',
    'Oversize Permit', 175.00
  )
ON CONFLICT (accessorial_id) DO NOTHING;