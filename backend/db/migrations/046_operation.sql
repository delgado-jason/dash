-- The user's operation (equipment/discipline), which tailors their achievements:
-- open-deck operations (flatbed, heavy haul, oversize) earn the oversize badge set;
-- others keep the universal badges. Per-user preference on the settlement_schedules
-- row (the de-facto settings table). RLS already enabled there (migration 042).
ALTER TABLE settlement_schedules
  ADD COLUMN IF NOT EXISTS operation text NOT NULL DEFAULT 'flatbed'
    CHECK (operation IN (
      'flatbed', 'heavy haul', 'oversize', 'tank',
      'van', 'reefer', 'dump', 'car hauler', 'other'
    ));
