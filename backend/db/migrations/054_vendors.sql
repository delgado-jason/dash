-- Vendors: the people/companies you PAY for services (shops, escort/pilot cars,
-- permit services, tires, towing, ...). The cost-side mirror of agents — a company
-- you have an opinion about — so it carries the same subjective 1–5 rating and an
-- audited rating history (why the grade changed). Categories are a curated list
-- validated in the app (see lib/constants/vendorCategories); stored as text here so
-- adding one is a code change, not a migration. No load/expense links yet — the
-- shop-spend readout is derived by name-match against maintenance_services.

CREATE TABLE IF NOT EXISTS vendors (
    vendor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    category VARCHAR(40) NOT NULL,
    rating SMALLINT NULL CHECK(rating > 0 AND rating < 6),
    contact_name VARCHAR(80) NULL,
    phone VARCHAR(50) NULL,
    email VARCHAR(120) NULL,
    website VARCHAR(255) NULL,
    city VARCHAR(80) NULL,
    state VARCHAR(2) NULL,
    service_area VARCHAR(120) NULL,   -- free text, e.g. "TX·OK·NM" (escorts span states)
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT vendor_name_per_user UNIQUE(name, user_id)
);

-- Audit trail for rating changes — same shape as agent_rating_history: every grade
-- change records the old/new value, a required reason, and the initials of who did
-- it. CASCADE so deleting a vendor cleans up its history.
CREATE TABLE IF NOT EXISTS vendor_rating_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(vendor_id) ON DELETE CASCADE,
    old_rating SMALLINT CHECK(old_rating > 0 AND old_rating < 6),
    new_rating SMALLINT NOT NULL CHECK(new_rating > 0 AND new_rating < 6),
    reason TEXT NOT NULL,
    changed_by VARCHAR(5) NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendors_user ON vendors(user_id);
CREATE INDEX IF NOT EXISTS idx_vendors_user_category ON vendors(user_id, category);
CREATE INDEX IF NOT EXISTS idx_vendor_rating_history_vendor ON vendor_rating_history(vendor_id);

-- RLS on (no policies) — the backend connects as the postgres owner and bypasses
-- RLS; this only walls the tables off from Supabase's PostgREST. Per CLAUDE.md §5,
-- every migration creating a public table must enable RLS explicitly (prod has no
-- superuser event trigger to do it automatically).
ALTER TABLE vendors               ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_rating_history ENABLE ROW LEVEL SECURITY;
