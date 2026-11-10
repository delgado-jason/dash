-- The deposit you typed, kept on the server instead of in one browser.
--
-- The cash board lets you tap either deposit and type the figure you actually
-- know — Landstar has told you, the statement has not landed yet. Until now
-- that number lived in `localStorage` under "dash.cashboard.deposit-overrides"
-- on whichever device you typed it on. So: typed on the laptop, invisible on
-- the phone; cleared site data, gone; Brandie never saw it; and no backup ever
-- held it. Every other figure on the Cash Flow and Plan pages goes to Postgres
-- (Nod Sheet "Cash Flow & Plan", call 6, nodded 2026-11-09).
--
-- Keyed by the STATEMENT date, which is what the board keys a deposit by —
-- the Wednesday the period settles, not the Thursday the cash lands. One
-- override per statement per account: typing a new figure replaces the old
-- one rather than stacking.
--
-- A typed figure beats a projection and never beats the feed's actual: once
-- the real statement arrives the board reads that, and the override stays as a
-- record of what you had been told. Deleting it is how you take it back.
CREATE TABLE IF NOT EXISTS public.deposit_overrides (
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  statement_date date NOT NULL,
  amount numeric(12, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, statement_date)
);

ALTER TABLE public.deposit_overrides ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.deposit_overrides IS
  'a deposit figure the owner typed before the statement landed, keyed by statement date (migration 105, 2026-11-09)';
COMMENT ON COLUMN public.deposit_overrides.statement_date IS
  'the Wednesday the pay period settles — not the Thursday the cash lands';
