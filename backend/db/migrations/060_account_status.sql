-- Account Status — the plan tracker (#spec 2026-08-16). Three tables:
-- plans (the year's framework: float lines + weekly reserves), plan_stages
-- (the waterfall as ORDERED DATA — vault ratchets, obligation payoffs, the
-- trailer fund; editing these IS editing the plan, 2028 = a new plans row),
-- account_snapshots (the Friday ritual, append-only history; snapshot is
-- taken BEFORE the sweep — the page computes the orders from raw balances).
-- Marge reads all three plus obligations directly.

CREATE TABLE public.plans (
  plan_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label varchar(80) NOT NULL,
  year int NOT NULL,
  float_line numeric NOT NULL DEFAULT 10000,
  float_line_home_lo numeric,
  float_line_home_hi numeric,
  maintenance_weekly numeric NOT NULL DEFAULT 500,
  tax_weekly numeric NOT NULL DEFAULT 350,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.plan_stages (
  stage_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.plans(plan_id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  position int NOT NULL,
  label varchar(120) NOT NULL,
  -- vault: ratchets the protected vault threshold to target_lo.
  -- obligation: pay the bound obligation to $0 (overflow above the ratchet funds it).
  -- trailer: fill the snapshot's trailer balance to target_lo..target_hi.
  kind text NOT NULL CHECK (kind IN ('vault', 'obligation', 'trailer')),
  obligation_id uuid REFERENCES public.obligations(obligation_id) ON DELETE SET NULL,
  target_lo numeric,
  target_hi numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plan_stages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.account_snapshots (
  snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  as_of date NOT NULL,
  ops numeric NOT NULL,
  vault numeric NOT NULL,
  maintenance numeric NOT NULL,
  tax numeric NOT NULL,
  trailer numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.account_snapshots ENABLE ROW LEVEL SECURITY;

-- Seed THE 2027 PLAN for the admin, stages in waterfall order. The Best Egg
-- stage binds to its live obligation; the IRS stage ships unbound (bind it in
-- EDIT PLAN once the IRS obligation exists — it grades as pending until then).
WITH admin_u AS (
  SELECT user_id FROM public.users WHERE role = 'admin' LIMIT 1
), p AS (
  INSERT INTO public.plans (user_id, label, year, float_line, float_line_home_lo, float_line_home_hi, maintenance_weekly, tax_weekly, active)
  SELECT user_id, 'The 2027 Plan', 2027, 10000, 13000, 14000, 500, 350, true FROM admin_u
  RETURNING plan_id, user_id
)
INSERT INTO public.plan_stages (plan_id, user_id, position, label, kind, obligation_id, target_lo, target_hi)
SELECT p.plan_id, p.user_id, s.position, s.label, s.kind,
  CASE WHEN s.bind_label IS NOT NULL THEN (
    SELECT o.obligation_id FROM public.obligations o
    WHERE o.user_id = p.user_id AND o.label = s.bind_label LIMIT 1
  ) END,
  s.target_lo, s.target_hi
FROM p, (VALUES
  (1, 'IRS — clear it', 'obligation', NULL::text, 0::numeric, NULL::numeric),
  (2, 'Vault cushion — the floor', 'vault', NULL, 15000, NULL),
  (3, 'Best Egg — kill the 22% note', 'obligation', 'Best Egg', 0, NULL),
  (4, 'Trade-up fund', 'trailer', NULL, 15000, 18000),
  (5, 'Cushion — three months of the burn', 'vault', NULL, 30000, 35000)
) AS s(position, label, kind, bind_label, target_lo, target_hi);
