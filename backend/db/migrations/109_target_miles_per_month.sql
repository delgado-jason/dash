-- The miles you COMMIT to, so the floor stops being computed from the miles
-- you happened to drive.
--
-- WHY. `basis.costPerTotalMile` is total cost ÷ actual driven miles over a
-- six-month window, and the rate ladder is that figure ÷ your keep. That makes
-- the floor a function of the outcome it is supposed to govern: a slow month
-- spreads the same fixed cost over fewer miles, so the floor RISES, which says
-- quote higher, which books less freight, which makes the month slower still.
--
-- October 2026 is the proof. On 5,062 driven miles the floating basis would
-- have quoted a $5.15 floor — not because anything about the business changed,
-- but because October was slow. Jason booked $3.96 and ignored the number,
-- correctly. A number you have learned to ignore is worse than no number.
--
-- With a commitment the floor becomes (fixed ÷ target) + variable-per-mile,
-- which holds still until it is deliberately re-set. The variance has to go
-- somewhere honest, so it goes to the pace card: not "your floor moved" but
-- "you are behind the miles you promised".
--
-- NULLABLE ON PURPOSE. No target set → every consumer falls back to today's
-- measured basis, so nothing breaks for a user who never opens the setting.
-- The value is a business commitment, not a schema default, so this migration
-- does not invent one for anybody.
ALTER TABLE public.settlement_schedules
  ADD COLUMN IF NOT EXISTS target_miles_per_month integer;

-- A target of zero would divide the fixed cost by nothing and send the floor to
-- infinity; a negative one is meaningless. The upper bound is a typo guard —
-- 40,000 miles a month is roughly 1,300 a day, every day.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'settlement_schedules_target_miles_sane'
  ) THEN
    ALTER TABLE public.settlement_schedules
      ADD CONSTRAINT settlement_schedules_target_miles_sane
      CHECK (target_miles_per_month IS NULL
             OR (target_miles_per_month > 0 AND target_miles_per_month <= 40000));
  END IF;
END
$$;

COMMENT ON COLUMN public.settlement_schedules.target_miles_per_month IS
  'driven miles per month the operator commits to; the rate floor is derived from this rather than from measured miles, so a slow month warns on the pace card instead of re-pricing the ladder (migration 109, 2026-11-11)';
