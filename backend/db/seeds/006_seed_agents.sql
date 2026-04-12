-- ============================================================
-- 006_seed_agents.sql
-- Agents belong to brokers. Real agent data for Jason's operation.
-- ============================================================

INSERT INTO agents (
  agent_id, user_id, broker_id,
  first_name, last_name,
  phone, email,
  preferred_contact, rating, notes
)
VALUES
  (
    'e0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'd0000000-0000-0000-0000-000000000001',
    'Mike', 'Sorrentino',
    NULL, 'mike@landstarny.com',
    'email', 5,
    'LLL - primary contact. Reliable, good loads.'
  ),
  (
    'e0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'd0000000-0000-0000-0000-000000000002',
    'Ausra', 'Jaronis',
    NULL, 'ausra.jaronis@landstarmail.com',
    'email', 4,
    'AGJ/Manifest Holdings'
  ),
  (
    'e0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'd0000000-0000-0000-0000-000000000003',
    'Hailee', 'Cartwright',
    NULL, 'hcartwright@spectrumtransportation.com',
    'email', 4,
    'BMA/Spectrum - books hazmat loads'
  ),
  (
    'e0000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000001',
    'd0000000-0000-0000-0000-000000000004',
    'Jennifer', 'Heggen',
    NULL, 'jen.heggen@landstarmail.com',
    'email', 3, NULL
  ),
  (
    'e0000000-0000-0000-0000-000000000005',
    'a0000000-0000-0000-0000-000000000001',
    'd0000000-0000-0000-0000-000000000005',
    'Charlie', 'Miltner',
    NULL, 'cmiltner@landstar-agent.com',
    'email', NULL,
    'Cold outreach target - Momentum'
  ),
  -- Alice agents
  (
    'e0000000-0000-0000-0000-000000000006',
    'a0000000-0000-0000-0000-000000000002',
    'd0000000-0000-0000-0000-000000000006',
    'Dana', 'Cruz',
    '2145550201', 'dana@jvl.com',
    'phone', 4, NULL
  )
ON CONFLICT (agent_id) DO NOTHING;