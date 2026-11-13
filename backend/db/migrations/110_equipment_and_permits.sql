-- What you scale empty, and what permitted freight costs you.
--
-- THREE NUMBERS THE LOAD SCORER HAS BEEN GUESSING OR IGNORING.
--
-- 1. empty_weight_lb — the truck and trailer with nothing on the deck.
--
--    The Scorer's weight box is labelled "Gross wt" and tested against an
--    80,000 lb legal limit, but an agent never quotes gross vehicle weight. He
--    says "it's a 52,000 pound load", which is the FREIGHT. Jason's own records
--    agree with the agent: across 54 loads carrying a weight the max is 50,000
--    and not one is above 80,000 — the column has always held freight weight.
--    So a 52,000 lb load read as "legal" and priced on the Standard ladder when
--    it is heavy and belongs on Specialized: 85c a driven mile under-asked,
--    quietly, every time.
--
--    With an empty weight stored, gross = freight + empty and the heavy line
--    stops being a magic 48,000 in my code. It becomes 80,000 minus whatever
--    you scale, so it moves on its own the day you hook a heavier trailer.
--    ONE FIELD, not a tractor field and a trailer field — Jason's call: "I
--    don't need to know what my trailer weighs by itself. What I need to know
--    is what my empty weight is." Two fields is two chances to update half of
--    it.
--
-- 2. permit_cost_usd — what a single state permit runs you ($40 today).
-- 3. escort_cost_per_loaded_mile — per escort, per LOADED mile ($2.00 today).
--
--    Escorts meet you at the pickup; you deadhead to it alone. Loaded miles,
--    never driven miles — the difference is real money on a long deadhead.
--
--    These are costs Landstar deducts from the linehaul and pays back at the
--    same 73% split, which means the load has to carry cost/0.73 for you to be
--    whole. Proved from settlement_lines on loads 7059883 and 3656664, where
--    "receipt = 0.73 x booked gross" reconciles to 73 cents. The Scorer does
--    that arithmetic; this migration only stores the two unit costs, because
--    they move with the market and belong to the user, not to a constant.
--
-- ALL THREE NULLABLE ON PURPOSE. Nothing set → the Scorer behaves exactly as it
-- does today (freight weight ungrossed, no permit block). A business fact is
-- not a schema default and this migration invents one for nobody.
ALTER TABLE public.settlement_schedules
  ADD COLUMN IF NOT EXISTS empty_weight_lb              integer,
  ADD COLUMN IF NOT EXISTS permit_cost_usd              numeric(10, 2),
  ADD COLUMN IF NOT EXISTS escort_cost_per_loaded_mile  numeric(10, 2);

-- Sanity bounds, all typo guards rather than policy.
--   empty weight: a tractor alone is ~19,000 and a legal combination cannot
--   scale 80,000 empty and still haul anything, so the ceiling is the legal
--   gross itself. Zero or negative would make the freight ceiling nonsense.
--   permit: a five-figure single-state permit is a fat finger.
--   escort: likewise. Zero is allowed for both — "I don't pay for these" is a
--   real answer, distinct from NULL's "I haven't said".
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'settlement_schedules_empty_weight_sane'
  ) THEN
    ALTER TABLE public.settlement_schedules
      ADD CONSTRAINT settlement_schedules_empty_weight_sane
      CHECK (empty_weight_lb IS NULL
             OR (empty_weight_lb > 0 AND empty_weight_lb < 80000));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'settlement_schedules_permit_cost_sane'
  ) THEN
    ALTER TABLE public.settlement_schedules
      ADD CONSTRAINT settlement_schedules_permit_cost_sane
      CHECK (permit_cost_usd IS NULL
             OR (permit_cost_usd >= 0 AND permit_cost_usd <= 5000));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'settlement_schedules_escort_cost_sane'
  ) THEN
    ALTER TABLE public.settlement_schedules
      ADD CONSTRAINT settlement_schedules_escort_cost_sane
      CHECK (escort_cost_per_loaded_mile IS NULL
             OR (escort_cost_per_loaded_mile >= 0 AND escort_cost_per_loaded_mile <= 100));
  END IF;
END
$$;

COMMENT ON COLUMN public.settlement_schedules.empty_weight_lb IS
  'Truck + trailer scaled empty. Freight ceiling = 80,000 - this. NULL = not set; the Scorer then grades freight weight without a gross.';
COMMENT ON COLUMN public.settlement_schedules.permit_cost_usd IS
  'Your average cost of one state permit. NULL = not set.';
COMMENT ON COLUMN public.settlement_schedules.escort_cost_per_loaded_mile IS
  'Cost per escort per LOADED mile (escorts ride with the freight, not the deadhead). NULL = not set.';
