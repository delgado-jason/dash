-- Per-item warning lead time: how many days before an item comes due to start
-- flagging it "due soon". A single global window (30 days) can't fit every
-- item — a truck wash done every 30 days can't have a 30-day notice. Overdue
-- is always critical; this only controls the warning lead. Backfills existing
-- rows at 14. (Compliance's second, pre-due "critical" threshold comes later.)
ALTER TABLE maintenance_items
  ADD COLUMN IF NOT EXISTS warn_lead_days INTEGER NOT NULL DEFAULT 14;
