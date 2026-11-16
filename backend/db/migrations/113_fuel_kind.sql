-- 113: a fill is diesel or DEF (the Fuel page sheet, call 6, nodded 2026-11-15).
--
-- DEF had no home: logged as diesel it skewed a tank's MPG, unlogged it was
-- cost that vanished. A DEF row carries gallons and the total, never closes a
-- tank window and never enters MPG, and counts in the thirty-day cost per
-- mile the way it leaves the pocket. Every row on the book is diesel.
-- Additive; applied on dev and prod before the merge (dump first).

ALTER TABLE public.fuel_entries
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'diesel';

ALTER TABLE public.fuel_entries DROP CONSTRAINT IF EXISTS fuel_entries_kind_check;
ALTER TABLE public.fuel_entries ADD CONSTRAINT fuel_entries_kind_check
  CHECK (kind IN ('diesel', 'def'));

-- A DEF fill never closes a tank.
ALTER TABLE public.fuel_entries DROP CONSTRAINT IF EXISTS fuel_entries_def_never_full;
ALTER TABLE public.fuel_entries ADD CONSTRAINT fuel_entries_def_never_full
  CHECK (kind <> 'def' OR filled_to_top = false);

COMMENT ON COLUMN public.fuel_entries.kind IS
  'diesel | def — a DEF fill carries gallons and cost, never a tank window';
