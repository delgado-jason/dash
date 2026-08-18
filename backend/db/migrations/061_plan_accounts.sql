-- Accounts become data (Jason, 2026-08-17: "add and remove accounts on the
-- plan page — I'm repurposing the trailer account as the vault"). Each account
-- carries a ROLE so the plan math knows which one floats (ops), which one
-- runs the cascade (vault), and which just get watched (reserve). Snapshot
-- balances move to per-account rows; the five fixed columns retire after
-- backfill. Marge now reads snapshot_balances JOIN plan_accounts.

CREATE TABLE public.plan_accounts (
  account_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name varchar(60) NOT NULL,
  role text NOT NULL CHECK (role IN ('ops', 'vault', 'reserve')),
  position int NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plan_accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.snapshot_balances (
  balance_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES public.account_snapshots(snapshot_id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.plan_accounts(account_id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  balance numeric NOT NULL
);
ALTER TABLE public.snapshot_balances ENABLE ROW LEVEL SECURITY;

-- Seed the five current accounts for the admin, then backfill every existing
-- snapshot's balances onto them.
WITH admin_u AS (
  SELECT user_id FROM public.users WHERE role = 'admin' LIMIT 1
), seeded AS (
  INSERT INTO public.plan_accounts (user_id, name, role, position)
  SELECT user_id, a.name, a.role, a.position
  FROM admin_u, (VALUES
    ('Ops', 'ops', 1),
    ('Vault', 'vault', 2),
    ('Maintenance', 'reserve', 3),
    ('Tax', 'reserve', 4),
    ('Trailer holding', 'reserve', 5)
  ) AS a(name, role, position)
  RETURNING account_id, user_id, name
)
INSERT INTO public.snapshot_balances (snapshot_id, account_id, user_id, balance)
SELECT s.snapshot_id, a.account_id, s.user_id,
  CASE a.name
    WHEN 'Ops' THEN s.ops
    WHEN 'Vault' THEN s.vault
    WHEN 'Maintenance' THEN s.maintenance
    WHEN 'Tax' THEN s.tax
    WHEN 'Trailer holding' THEN s.trailer
  END
FROM public.account_snapshots s
JOIN seeded a ON a.user_id = s.user_id;

ALTER TABLE public.account_snapshots
  DROP COLUMN ops,
  DROP COLUMN vault,
  DROP COLUMN maintenance,
  DROP COLUMN tax,
  DROP COLUMN trailer;
