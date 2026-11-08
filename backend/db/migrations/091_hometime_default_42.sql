-- The hometime default is 42 days (Jason's call, Nod Sheet "The Numbers,
-- Site-Wide" GL-140, 2026-11-05: "Default 42, chip waits for settings";
-- general items 5a, 2026-11-07).
--
-- Migration 043 gave the column DEFAULT 21 — three weeks, a company-driver
-- rhythm. The code's DEFAULTS moved to 42 with 5a (the backend GET with no row,
-- the frontend fallbacks, the contract pin); a row inserted without the field
-- must land on the same number, or a new account would read 21 in the
-- database and 42 on the screen. No data moves: the one prod row already
-- holds 42 (typed 2026-11-01) and dev's row keeps its 21 as a stored value.
ALTER TABLE settlement_schedules
  ALTER COLUMN hometime_threshold_days SET DEFAULT 42;
