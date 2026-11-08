-- The fill-up form says whether the tank was filled to the top (Jason's call,
-- Nod Sheet "The Numbers, Site-Wide" GL-154, 2026-11-05: "Yes, ticked by
-- default"; "General Items" Nod Sheet mock 2, call 2 lean A nodded 2026-11-07).
--
-- Per-tank MPG, the best tank and the NEW BEST pop measure full-to-full: a tank
-- window closes at a full fill. Until now "full" was a guess — 120 gallons or
-- more (fuelEconomy FULL_THRESHOLD). Jason's habit is a quarter-tank stop of
-- about 120 gallons, so the guess sat right on his own fills. From this build
-- the fill carries his word instead: filled_to_top, ticked by default on the
-- form (filling up is his rule), unticked for a partial. Only a ticked fill
-- closes a window.
--
-- History keeps working: every existing row is backfilled by the old rule, so
-- today's windows, MPG and best tank read exactly as they did (prod 2026-11-08:
-- 55 fills, 32 at 120+ gal become ticked, 23 below become partials — the same
-- split the guess produced). The column default is TRUE for a row inserted
-- without the field; the form always sends it.
ALTER TABLE fuel_entries
    ADD COLUMN IF NOT EXISTS filled_to_top BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE fuel_entries
   SET filled_to_top = (gallons >= 120);
