-- 077 · compliance renewals — the closed cycles behind "Mark renewed" (decision 8A)
-- (Daily Dollars and Shop Nod Sheet 2026-09-13, nodded 8A: the button, with a history)
--
-- Renewing a paper rolls two dates forward. Before 8A the old cycle was simply
-- overwritten by the Edit form; an audit asks for the cycle that just closed, so
-- each renewal writes it down here first and the item is updated after.
--
-- A renewal belongs to exactly one clock, and there are two of them:
--   • a real compliance_items row (the six papers on /compliance), or
--   • a driver's CDL, which lives on drivers.cdl_expiration and has no
--     compliance_items row of its own.
-- Both FKs are therefore nullable and the CHECK makes exactly one mandatory —
-- `<>` on two booleans is XOR, and a NULL on either side would make the whole
-- expression NULL (which a CHECK passes), so the two IS NULL tests are what keep
-- it honest.
CREATE TABLE IF NOT EXISTS public.compliance_renewals (
  renewal_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  compliance_item_id uuid REFERENCES public.compliance_items(compliance_item_id) ON DELETE CASCADE,
  driver_id          uuid REFERENCES public.drivers(driver_id) ON DELETE CASCADE,
  issued_on          date,            -- the cycle that just closed
  expired_on         date,
  doc_number         text,
  renewed_on         date NOT NULL,   -- the day the new cycle started
  next_expires_on    date,            -- what the item was set to
  note               text,
  renewed_by         uuid REFERENCES public.users(user_id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compliance_renewals_one_subject
    CHECK ((compliance_item_id IS NULL) <> (driver_id IS NULL))
);

-- RLS on every public table (CLAUDE.md §5). The backend connects as the
-- postgres owner and bypasses it; this walls the table off from PostgREST.
ALTER TABLE public.compliance_renewals ENABLE ROW LEVEL SECURITY;

-- The history reads are always "this item's cycles" or "this driver's cycles",
-- both user_id-scoped, newest first.
CREATE INDEX IF NOT EXISTS idx_compliance_renewals_item
  ON public.compliance_renewals(compliance_item_id);
CREATE INDEX IF NOT EXISTS idx_compliance_renewals_driver
  ON public.compliance_renewals(driver_id);
CREATE INDEX IF NOT EXISTS idx_compliance_renewals_user
  ON public.compliance_renewals(user_id);
