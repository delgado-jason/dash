-- Maintenance tracking: a forward-looking SCHEDULE (what's due) and a SERVICES
-- log (what was done). Units: 'tractor' (odometer, carries the engine items) and
-- 'trailer' (hubodometer). Each schedule item can be mileage-based, time-based,
-- or both (due = whichever comes first). Costs here are for VENDOR PRICING only
-- — they are NOT rolled into the P&L (QuickBooks already books maintenance).

CREATE TABLE IF NOT EXISTS maintenance_items (
    item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    unit VARCHAR(20) NOT NULL CHECK (unit IN ('tractor', 'trailer')),
    name VARCHAR(120) NOT NULL,
    category VARCHAR(40) NOT NULL DEFAULT 'other',
    interval_miles INTEGER,        -- null = not mileage-based
    interval_months INTEGER,       -- null = not time-based
    interval_hours INTEGER,        -- null = not engine-hours-based
    last_done_miles INTEGER,       -- odometer/hub at last completion
    last_done_date DATE,           -- date of last completion
    active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS maintenance_services (
    service_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    unit VARCHAR(20) NOT NULL CHECK (unit IN ('tractor', 'trailer')),
    service_date DATE NOT NULL,
    odometer INTEGER,              -- tractor odometer or trailer hubodometer
    vendor VARCHAR(120),
    location VARCHAR(120),
    description TEXT NOT NULL,
    cost NUMERIC(12, 2),           -- vendor pricing only, NOT a P&L figure
    invoice_number VARCHAR(60),
    receipt_ref VARCHAR(255),      -- filename or link (real upload is phase 2)
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Which schedule items a service completed. Lets one PM visit reset several
-- items, and gives each item its service history.
CREATE TABLE IF NOT EXISTS maintenance_service_items (
    service_id UUID NOT NULL REFERENCES maintenance_services(service_id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES maintenance_items(item_id) ON DELETE CASCADE,
    PRIMARY KEY (service_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_maintenance_items_user ON maintenance_items(user_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_services_user ON maintenance_services(user_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_service_items_item ON maintenance_service_items(item_id);
