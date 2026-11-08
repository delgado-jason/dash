-- Settlement schedule rows carry a start date (Jason's call, Nod Sheet "The
-- Numbers, Site-Wide" Q10, 2026-11-05: "Date the schedule rows" — the January
-- loads settle pre-trailer; "General Items" Nod Sheet mock 6, call 6 lean A
-- nodded 2026-11-07: edit the current row in place, a new row starts a new
-- effective date).
--
-- The PAY SPLIT (linehaul %, trailer %, fuel-surcharge %, accessorial %) moves
-- out of settlement_schedules — one undated row per user, also the home of
-- settings that are not dated (settlement day, detention hours, the hometime
-- threshold, the rate tiers) — into settlement_splits: one row per start date.
-- A load settles on the split in force on its delivery day (the latest
-- effective_from on or before it; its pickup day for a load not yet
-- delivered; today for one with neither). The revenue SQL joins that row
-- (Rule change NET-01). A load dated before the first split has no split and
-- the API refuses the read, never prices at 100%.
--
-- Seed, per user with a schedule row: the split on file, effective the day the
-- first trailer went into service (prod: 2026-02-03 — "the trailer's share
-- began with the trailer"); and, when the trailer's share is above zero and
-- the trailer started after Jan 1 of its year, a pre-trailer row from that
-- Jan 1 with trailer 0% and accessorials at the linehaul rate — prod's three
-- loads delivered before Feb 3, 2026 settle there (the Jan 30 statement paid
-- 4574251's linehaul at exactly 65%, which is what Landstar pays without a
-- trailer). The four pct columns stay on settlement_schedules until the code
-- that stops naming them is deployed; migration 101 drops them AFTER that.
-- Backups: prod-backups/backup-5b-iv-{DEV,PROD}-settlement_schedules.csv.
CREATE TABLE IF NOT EXISTS settlement_splits (
    split_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    effective_from     DATE NOT NULL,
    linehaul_pct       NUMERIC(5,4) NOT NULL CHECK (linehaul_pct >= 0 AND linehaul_pct <= 1),
    trailer_pct        NUMERIC(5,4) NOT NULL CHECK (trailer_pct >= 0 AND trailer_pct <= 1),
    fuel_surcharge_pct NUMERIC(5,4) NOT NULL CHECK (fuel_surcharge_pct >= 0 AND fuel_surcharge_pct <= 1),
    accessorial_pct    NUMERIC(5,4) NOT NULL CHECK (accessorial_pct >= 0 AND accessorial_pct <= 1),
    note               TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT settlement_splits_shares_le_whole CHECK (linehaul_pct + trailer_pct <= 1),
    CONSTRAINT settlement_splits_one_per_start UNIQUE (user_id, effective_from)
);

ALTER TABLE settlement_splits ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS settlement_splits_user_from_idx
    ON settlement_splits (user_id, effective_from DESC);

-- The split on file, from the day the first trailer went into service.
INSERT INTO settlement_splits
       (user_id, effective_from, linehaul_pct, trailer_pct, fuel_surcharge_pct, accessorial_pct, note)
SELECT ss.user_id,
       COALESCE(t.first_trailer, DATE '2026-01-01'),
       ss.linehaul_pct, ss.trailer_pct, ss.fuel_surcharge_pct, ss.accessorial_pct,
       CASE WHEN ss.trailer_pct > 0 AND t.first_trailer IS NOT NULL
            THEN 'the trailer''s share began with the trailer'
            ELSE 'the schedule on file when the rows became dated (2026-11-08)' END
  FROM settlement_schedules ss
  LEFT JOIN (SELECT user_id, MIN(in_service_date) AS first_trailer FROM trailers GROUP BY user_id) t
    ON t.user_id = ss.user_id
ON CONFLICT (user_id, effective_from) DO NOTHING;

-- Before the trailer: the same linehaul and fuel-surcharge shares, no trailer
-- share, accessorials at the linehaul rate.
INSERT INTO settlement_splits
       (user_id, effective_from, linehaul_pct, trailer_pct, fuel_surcharge_pct, accessorial_pct, note)
SELECT ss.user_id,
       date_trunc('year', t.first_trailer)::date,
       ss.linehaul_pct, 0, ss.fuel_surcharge_pct, ss.linehaul_pct,
       'before the trailer — loads delivered before it settle here (Q10, 2026-11-05)'
  FROM settlement_schedules ss
  JOIN (SELECT user_id, MIN(in_service_date) AS first_trailer FROM trailers GROUP BY user_id) t
    ON t.user_id = ss.user_id
 WHERE ss.trailer_pct > 0
   AND t.first_trailer > date_trunc('year', t.first_trailer)::date
ON CONFLICT (user_id, effective_from) DO NOTHING;
