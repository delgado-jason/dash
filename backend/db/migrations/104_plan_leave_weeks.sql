-- The leave reserve's horizon (Nod Sheet "The Cockpit", call 5 lean A, nodded
-- 2026-11-08): how many weeks of a parked truck the Vault should cover.
--
-- The leave reserve answers "how long can I park the truck and keep the
-- household and the truck whole". The target is weeks × the weekly burn of a
-- truck that is not rolling (the weekly payroll + the sit cost: fixed costs and
-- the notes), and the Vault is the balance measured against it. The burn is
-- computed from figures already stored; the only new input is the horizon,
-- which is the owner's choice and lives on the plan beside the floors.
--
-- Default 4: a month parked, the figure the sheet drew. 1 to 52: a reserve of
-- zero weeks is not a horizon, and a year is the far end of any plan.
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS leave_weeks INTEGER NOT NULL DEFAULT 4;

ALTER TABLE plans
  DROP CONSTRAINT IF EXISTS plans_leave_weeks_range;
ALTER TABLE plans
  ADD CONSTRAINT plans_leave_weeks_range CHECK (leave_weeks BETWEEN 1 AND 52);

COMMENT ON COLUMN plans.leave_weeks IS
  'the leave reserve horizon in weeks of a parked truck (migration 104, 2026-11-08)';
