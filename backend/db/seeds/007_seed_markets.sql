-- ============================================================
-- 007_seed_markets.sql
-- Markets scoped per user. Seeding Jason's active lane markets.
-- ============================================================

INSERT INTO markets (market_id, user_id, market_name, notes)
VALUES
  -- Jason markets
  ('f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Chicago Market',     'Strong outbound, good RPM'),
  ('f0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Dallas Market',      'Competitive, watch deadhead'),
  ('f0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Nashville Market',   'Solid mid-south connector'),
  ('f0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Atlanta Market',     'High volume, moderate RPM'),
  ('f0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Huntsville Market',  'Home market'),
  ('f0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'Columbus Market',    'Midwest connector'),
  ('f0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'Charlotte Market',   'Southeast freight hub'),
  ('f0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'Memphis Market',     'Mid-south distribution'),
  ('f0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'Houston Market',     'Gulf coast industrial'),
  ('f0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'Philadelphia Market','Northeast corridor'),
  -- Alice markets
  ('f0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000002', 'Dallas Market',      NULL),
  ('f0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000002', 'Houston Market',     NULL)
ON CONFLICT (market_id) DO NOTHING;