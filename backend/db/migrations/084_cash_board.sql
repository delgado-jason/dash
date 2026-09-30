-- The Cash Board, anchored (Nod Sheet 2026-09-30, all leans; #502).
--
-- OPS NOW: a bank balance Jason types any morning — date + Ops balance — so
-- the board re-bases from it instead of from last Friday's snapshot. One per
-- day; a second entry the same day replaces the first. Marge reads it too.
CREATE TABLE IF NOT EXISTS public.ops_checks (
  check_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  as_of date NOT NULL,
  balance numeric NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, as_of)
);
ALTER TABLE public.ops_checks ENABLE ROW LEVEL SECURITY;

-- Settlement day stays Wednesday; the cash lands the next day (Jason,
-- 2026-09-30: "settlement day is still wednesday and hits the account on
-- thursday"). The board dates deposits settlement + lag.
ALTER TABLE public.settlement_schedules
  ADD COLUMN IF NOT EXISTS deposit_lag_days smallint NOT NULL DEFAULT 1;
