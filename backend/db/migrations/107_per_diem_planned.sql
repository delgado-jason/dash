-- A day you INTEND to be home, kept apart from a day you WERE home.
--
-- The forecast has never known when Jason is home. `per_diem_days` is a tax
-- record — it holds 27 home days, the latest dated Oct 31, and has never held
-- a day in the future, because days-away drive a deduction and a deduction
-- cannot count a day that has not happened. So the cash board projects revenue,
-- fuel and a fuel advance through every week, including the ones he is not
-- working. (Nod Sheet "Home Time And The Forecast", 2026-11-09.)
--
-- The fix is one boolean, not a fourth status. `per_diem_status` stays
-- `full | half | home` so every reader that asks for a status keeps the
-- meaning it always had; `planned` says only whether the day has happened yet.
--
-- WHY A FLAG AND NOT AN ENUM VALUE. A `home_planned` status would be
-- fail-safe for readers testing `status = 'home'` — they would simply miss it
-- — but it breaks any reader testing the negative (`status <> 'home'` to mean
-- "away"), and it would put a plan inside the tax vocabulary. The flag keeps
-- the two ideas separate, and the blast radius is three queries in
-- `perDiemServices.js`, all of which this change updates:
--   getHomeDays      → utilization on the Fleet tab. MUST NOT see a plan, or a
--                      day that has not happened counts as a day off the road.
--   getLastHomeDay   → already bounded by `day <= CURRENT_DATE`, but a plan
--                      backdated by mistake would still land in it.
--   getPerDiemDays   → the page itself, which DOES want the flag, to draw a
--                      planned day dashed.
--
-- The deduction is untouched by construction: it counts `full` and `half`,
-- and a plan is only ever recorded as `home`. The constraint below says so,
-- so the tax figure cannot be polluted even by a bad write.
ALTER TABLE public.per_diem_days
  ADD COLUMN IF NOT EXISTS planned boolean NOT NULL DEFAULT false;

-- A plan is a statement about being HOME. There is no reason to plan a day
-- away — the deduction would not count it until it happened anyway — and
-- allowing it is how a future day would eventually reach the tax number.
ALTER TABLE public.per_diem_days
  DROP CONSTRAINT IF EXISTS per_diem_days_planned_is_home;
ALTER TABLE public.per_diem_days
  ADD CONSTRAINT per_diem_days_planned_is_home
  CHECK (NOT planned OR status = 'home');

-- The forecast reads "the planned home days inside a window" on every cash
-- board render; the page reads a year at a time. Both start from the user.
CREATE INDEX IF NOT EXISTS per_diem_days_planned_idx
  ON public.per_diem_days (user_id, day)
  WHERE planned;

COMMENT ON COLUMN public.per_diem_days.planned IS
  'true = a home day Jason INTENDS to take, not one that happened (migration 107, 2026-11-10); the per-diem deduction and the utilization window both exclude it';
