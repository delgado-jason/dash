-- 057_market_name_hygiene.sql
-- Data integrity pass on market names + hardening against the dup/typo classes.
--
-- Every statement is idempotent and set-based, so this is safe to apply to any
-- environment (dev/prod) and safe to re-run: whitespace/typo UPDATEs match zero
-- rows once clean, the merge is a no-op once merged, and the uniqueness swap is
-- guarded with IF EXISTS.
--
-- Whitespace is normalized COLLAPSE-THEN-TRIM: regexp_replace turns any run of
-- whitespace (incl. tabs/newlines, which btrim does NOT strip) into single
-- spaces first, then btrim removes the edges. Doing btrim first would leave a
-- boundary tab as a trailing space after the collapse. The one-time UPDATE and
-- the permanent index use the identical expression so they can never disagree.

BEGIN;

-- 0) Drop the old case/whitespace-SENSITIVE uniqueness FIRST, so the corrective
--    UPDATEs below can't be aborted mid-flight by it (e.g. a typo fix whose
--    corrected value already exists case-sensitively). The new normalized index
--    is (re)built at the very end and validates the final state. Handles both a
--    fresh DB (constraint) and an already-migrated one (bare index).
ALTER TABLE markets DROP CONSTRAINT IF EXISTS unique_market_per_user;
DROP INDEX IF EXISTS unique_market_per_user;

-- 1) Whitespace hygiene: collapse internal runs, then trim ends, on every name.
--    Fixes the "Atlanta Market " (trailing-space) class that let visually
--    identical names live as separate markets.
UPDATE markets
SET market_name = btrim(regexp_replace(market_name, '\s+', ' ', 'g')),
    updated_at = now()
WHERE market_name <> btrim(regexp_replace(market_name, '\s+', ' ', 'g'));

-- 2) Specific typo / missing-word fixes (guarded -> no-op where absent).
UPDATE markets SET market_name = 'Cleveland Market', updated_at = now()
WHERE market_name = 'Cleveland Marke';

UPDATE markets SET market_name = 'Las Vegas Market', updated_at = now()
WHERE market_name = 'Las Vegas';

-- 3) Merge the duplicate D.C. market into "Washington DC Market" (the same
--    physical market, entered two ways). Preserve the loser's boundary notes if
--    the survivor has none, repoint BOTH load FK columns, then delete the loser.
--    Per-account and matched by name (not a hard-coded id), so it is
--    environment-portable and idempotent.
DO $$
DECLARE
  acct     uuid;
  loser    uuid;
  survivor uuid;
BEGIN
  FOR acct IN
    SELECT DISTINCT user_id
    FROM markets
    WHERE market_name IN ('D.C. Market', 'Washington DC Market')
  LOOP
    SELECT market_id INTO loser
      FROM markets WHERE user_id = acct AND market_name = 'D.C. Market';
    SELECT market_id INTO survivor
      FROM markets WHERE user_id = acct AND market_name = 'Washington DC Market';

    IF loser IS NOT NULL AND survivor IS NOT NULL THEN
      UPDATE markets s
        SET notes = COALESCE(NULLIF(btrim(s.notes), ''),
                             (SELECT notes FROM markets WHERE market_id = loser)),
            updated_at = now()
        WHERE s.market_id = survivor;
      UPDATE loads SET origin_market_id = survivor      WHERE origin_market_id = loser;
      UPDATE loads SET destination_market_id = survivor WHERE destination_market_id = loser;
      DELETE FROM markets WHERE market_id = loser;
    END IF;
  END LOOP;
END $$;

-- 4) Harden: normalized, case-insensitive uniqueness so "Atlanta Market " can
--    never again coexist with "Atlanta Market". Functional uniqueness must be an
--    index, not a table constraint. Same expression as step 1, so the data is
--    already clean and this builds without collision (and would abort the whole
--    transaction if any duplicate somehow remained -- fail-safe).
CREATE UNIQUE INDEX unique_market_per_user
  ON markets (user_id, lower(btrim(regexp_replace(market_name, '\s+', ' ', 'g'))));

COMMIT;
