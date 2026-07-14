-- Facilities come in two kinds. A business is identified by its name (with the
-- Inc/LLC normalization handled app-side); a job site has no company name and is
-- identified by its address/location instead. So name becomes optional, and a
-- kind flag says which identity applies.
ALTER TABLE facilities
    ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'business'
    CHECK (kind IN ('business', 'job_site'));

-- A job site may have no name — the address carries the identity.
ALTER TABLE facilities ALTER COLUMN name DROP NOT NULL;
