-- Fleet entities: make truck / driver / trailer first-class and tie loads +
-- maintenance to them. Adds a trailers table, enriches drivers, adds avatar_url
-- (generated or uploaded) to each entity, and nullable FKs on loads +
-- maintenance. FKs are nullable so existing rows stay valid; a data backfill
-- assigns the single rig. Multi-truck UI comes later.

-- ---- avatars on trucks ----
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);

-- ---- enrich drivers ----
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS phone VARCHAR(30),
  ADD COLUMN IF NOT EXISTS email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS cdl_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS cdl_state VARCHAR(2),
  ADD COLUMN IF NOT EXISTS cdl_expiration DATE,
  ADD COLUMN IF NOT EXISTS endorsements VARCHAR(100),
  ADD COLUMN IF NOT EXISTS hire_date DATE,
  ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500),
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- ---- trailers (mirrors trucks; reuses the truck_status enum) ----
CREATE TABLE IF NOT EXISTS trailers (
  trailer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  unit_number VARCHAR(50) NOT NULL,
  vin VARCHAR(50),
  plate_number VARCHAR(20),
  plate_state VARCHAR(2),
  trailer_type VARCHAR(40) NOT NULL DEFAULT 'flatbed',
  length_ft INTEGER,
  make VARCHAR(60),
  model VARCHAR(60),
  year INTEGER,
  current_hub INTEGER NOT NULL DEFAULT 0,
  status truck_status NOT NULL DEFAULT 'active',
  avatar_url VARCHAR(500),
  in_service_date DATE,
  notes TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trailers_user ON trailers(user_id);

-- ---- tie loads to truck / driver / trailer ----
ALTER TABLE loads
  ADD COLUMN IF NOT EXISTS truck_id UUID REFERENCES trucks(truck_id),
  ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES drivers(driver_id),
  ADD COLUMN IF NOT EXISTS trailer_id UUID REFERENCES trailers(trailer_id);

-- ---- tie maintenance to truck / trailer (unit string stays for now) ----
ALTER TABLE maintenance_items
  ADD COLUMN IF NOT EXISTS truck_id UUID REFERENCES trucks(truck_id),
  ADD COLUMN IF NOT EXISTS trailer_id UUID REFERENCES trailers(trailer_id);
ALTER TABLE maintenance_services
  ADD COLUMN IF NOT EXISTS truck_id UUID REFERENCES trucks(truck_id),
  ADD COLUMN IF NOT EXISTS trailer_id UUID REFERENCES trailers(trailer_id);
