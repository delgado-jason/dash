-- The OPS NOW form asks, on a day a deposit is dated, whether it has landed
-- (Jason's call, Nod Sheet "The Numbers, Site-Wide" Q3, 2026-11-05: "Ask on
-- the form, deposit days only"; "General Items" Nod Sheet mock 3, call 3 lean
-- A nodded 2026-11-07: shown only on a day a deposit is dated, unticked by
-- default because he types before the bank posts).
--
-- The board opens its current column on the latest balance typed and asks of
-- every bank event whether the number already holds it. A deposit dated the
-- same day as a morning check was assumed to be in the number (ACH posts
-- overnight). Now the check says: deposit_landed FALSE keeps that deposit
-- ahead of the number ("still to come"); TRUE means it is already inside.
-- NULL means the question was not asked — the day had no deposit, or the
-- check predates this build — and the board keeps the old reading for it, so
-- the two Thursday checks already on prod (Oct 1, Oct 8) read as they did.
ALTER TABLE ops_checks
    ADD COLUMN IF NOT EXISTS deposit_landed BOOLEAN;

COMMENT ON COLUMN ops_checks.deposit_landed IS
  'On a day a deposit is dated: FALSE = typed before it landed (the board keeps it ahead), TRUE = already inside the balance. NULL = not asked (no deposit that day, or pre-2026-11-08).';
