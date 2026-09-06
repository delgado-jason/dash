-- 067: the settlement feed (2026-09-06, design locked with Jason).
-- One row per weekly Landstar Contractor Statement + every line on it.
-- Fed by the DTS server's parser, which refuses statements that don't
-- reconcile against their own printed totals. A week is never overwritten
-- (UNIQUE + DO NOTHING at the service layer).

CREATE TABLE IF NOT EXISTS public.settlements (
  settlement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  period_ending date NOT NULL,
  revenue numeric(14,2) NOT NULL,
  refunds numeric(14,2) NOT NULL DEFAULT 0,
  deductions numeric(14,2) NOT NULL,
  net numeric(14,2) NOT NULL,
  escrow_tractor numeric(14,2),
  escrow_trailer numeric(14,2),
  ytd_earnings numeric(14,2),
  sha256 char(64) NOT NULL,
  server_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settlements_week_unique UNIQUE (user_id, period_ending)
);
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_settlements_user ON public.settlements(user_id, period_ending);

CREATE TABLE IF NOT EXISTS public.settlement_lines (
  line_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  settlement_id uuid NOT NULL REFERENCES public.settlements(settlement_id) ON DELETE CASCADE,
  -- nullable: recurring lines have no load; unmatched loads keep the number
  load_id uuid REFERENCES public.loads(load_id) ON DELETE SET NULL,
  load_number varchar(20),
  agent_code varchar(3),
  kind varchar(12) NOT NULL,          -- 'trip' | 'recurring'
  line_class varchar(24) NOT NULL,    -- linehaul|fsc|accessorial|advance|fee|insurance|escrow|plates-permits|permit-fee|escort-fee|admin-fee|reversal|other
  is_adjustment boolean NOT NULL DEFAULT false,
  description varchar(200) NOT NULL,
  revenue numeric(14,2),
  refunds numeric(14,2),
  deductions numeric(14,2),
  net numeric(14,2),
  line_date varchar(10),
  unit varchar(10)
);
ALTER TABLE public.settlement_lines ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_settlement_lines_settlement ON public.settlement_lines(settlement_id);
CREATE INDEX IF NOT EXISTS idx_settlement_lines_load ON public.settlement_lines(load_id);
CREATE INDEX IF NOT EXISTS idx_settlement_lines_user ON public.settlement_lines(user_id);
