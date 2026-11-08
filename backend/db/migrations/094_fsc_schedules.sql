-- Landstar's fuel-surcharge band table, pasted with its effective date
-- (Jason's call, Nod Sheet "The Numbers, Site-Wide" GL-155, 2026-11-05: "They
-- do provide a schedule but it constantly changes and there is no api for it.
-- I would have to upload it frequently" · "Yes, it's a price-band table";
-- "General Items" Nod Sheet mock 5, call 5 lean A nodded 2026-11-07: keep
-- every pasted table with its effective date — a past month's par uses the
-- table in force then).
--
-- One row per pasted table. bands is a JSON array of
--   { "low": 4.000, "high": 4.049, "cpm": 0.58 }
-- — the national-average diesel price range in $/gal (inclusive; the last band
-- may carry "high": null for "and up") and the surcharge in $ per loaded mile.
-- The table in force on a day is the row with the latest effective_from on or
-- before it. Until the first paste there is no row and the Fuel page's par
-- stays a labelled estimate — never a guessed table.
CREATE TABLE IF NOT EXISTS fsc_schedules (
    schedule_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    effective_from DATE NOT NULL,
    bands          JSONB NOT NULL
                   CONSTRAINT fsc_schedules_bands_is_list CHECK (jsonb_typeof(bands) = 'array' AND jsonb_array_length(bands) >= 2),
    note           TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fsc_schedules_one_per_start UNIQUE (user_id, effective_from)
);

ALTER TABLE fsc_schedules ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS fsc_schedules_user_from_idx
    ON fsc_schedules (user_id, effective_from DESC);
