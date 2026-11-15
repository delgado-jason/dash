-- 111 · The Maintenance page, PR 2 (the sheet nodded 2026-11-15, calls 6, 7, 8):
--   • a KIND on every service — PM · repair · tire · wash · inspection · reading —
--     so repairs against PM, and tires against everything, become readable;
--   • a WARRANTY date on a service, so a clock whose last visit is still under
--     warranty says so before the owner pays twice;
--   • OPEN ISSUES — a defect noticed on the road, with the day and how urgent,
--     closed by the service that fixed it. The Oct 30 "warning lights on dash"
--     lived nowhere until it was a $4,710 invoice.
-- Additive: columns and a table. Applied dev then prod BEFORE the merge, with a
-- dump first (backend/db/dump.sh). The rows on the book are classified from
-- what they already say; the owner can change a kind on the row.
BEGIN;

ALTER TABLE maintenance_services ADD COLUMN IF NOT EXISTS kind VARCHAR(20);
ALTER TABLE maintenance_services DROP CONSTRAINT IF EXISTS maintenance_services_kind_check;
ALTER TABLE maintenance_services
  ADD CONSTRAINT maintenance_services_kind_check
  CHECK (kind IS NULL OR kind IN ('pm', 'repair', 'tire', 'wash', 'inspection', 'reading'));
ALTER TABLE maintenance_services ADD COLUMN IF NOT EXISTS warranty_until DATE;

-- Classify the rows on the book, in this order: a meter reading row, a wash,
-- a tire, an inspection, a visit that reset a clock (PM), everything else a
-- repair. Only rows with no kind yet — the migration is re-runnable.
UPDATE maintenance_services s
   SET kind = CASE
     WHEN s.unit = 'apu' AND s.apu_hours IS NOT NULL
          AND COALESCE(s.cost, 0) = 0 AND s.description ILIKE '%reading%' THEN 'reading'
     WHEN s.description ILIKE '%wash%' THEN 'wash'
     WHEN s.description ILIKE '%tire%' OR s.description ILIKE '%tyre%' THEN 'tire'
     WHEN s.description ILIKE '%inspection%' OR s.description ILIKE '%inspect %' THEN 'inspection'
     WHEN EXISTS (SELECT 1 FROM maintenance_service_items si WHERE si.service_id = s.service_id) THEN 'pm'
     ELSE 'repair'
   END
 WHERE s.kind IS NULL;

CREATE TABLE IF NOT EXISTS maintenance_issues (
    issue_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    unit VARCHAR(20) NOT NULL DEFAULT 'tractor' CHECK (unit IN ('tractor', 'trailer', 'apu')),
    what TEXT NOT NULL,
    noticed_on DATE NOT NULL,
    severity VARCHAR(10) NOT NULL DEFAULT 'watch' CHECK (severity IN ('watch', 'soon', 'now')),
    status VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    -- The service that fixed it. ON DELETE SET NULL: deleting a log row never
    -- deletes the fact that the issue was closed.
    closed_by_service_id UUID REFERENCES maintenance_services(service_id) ON DELETE SET NULL,
    closed_on DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE maintenance_issues ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_maintenance_issues_user_status ON maintenance_issues(user_id, status);

COMMIT;
