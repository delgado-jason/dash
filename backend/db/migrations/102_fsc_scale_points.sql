-- Landstar's weekly fuel-surcharge scale point (Jason's call, "General Items"
-- Nod Sheet mock 8, call 8 lean A nodded 2026-11-08: "Take the lean on mock 8"
-- — paste the one header line of the weekly Ranger report; dash keeps the
-- points and fits the scale from them; the PADD lines are optional extras).
--
-- What Landstar publishes each week is not a band table but the scale's
-- output for the week: "National Average $6.292 → .86 cents per mile · 52% of
-- the linehaul", with the regional PADD points. One row per report week; each
-- point (national and regional) is a (price, cents-per-mile) pair the scale
-- fit reads: cents per mile = (price − peg) ÷ base mpg, rounded to the cent.
-- Par on the Fuel page reads a pasted band table first (an explicit paste),
-- then this fit, then the estimate — never a guess dressed as a table.
--
-- Seed: the first report Jason sent (effective 11/03/26–11/09/26), for every
-- account with a settlement schedule.
CREATE TABLE IF NOT EXISTS fsc_scale_points (
    point_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    week_of         DATE NOT NULL,                       -- the report's first effective day
    national_avg    NUMERIC(6,3) NOT NULL
                    CONSTRAINT fsc_scale_points_price_range CHECK (national_avg > 0 AND national_avg <= 20),
    cents_per_mile  NUMERIC(6,4) NOT NULL                -- $ per loaded mile (0.86 = 86¢)
                    CONSTRAINT fsc_scale_points_cpm_range CHECK (cents_per_mile >= 0 AND cents_per_mile <= 5),
    pct_of_linehaul NUMERIC(5,4)                         -- the % scale, when the line carries it (0.52)
                    CONSTRAINT fsc_scale_points_pct_range CHECK (pct_of_linehaul IS NULL OR (pct_of_linehaul >= 0 AND pct_of_linehaul <= 5)),
    regions         JSONB,                               -- [{"region":"PADD 1A","price":6.416,"cpm":0.88}, …]
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fsc_scale_points_one_per_week UNIQUE (user_id, week_of)
);

ALTER TABLE fsc_scale_points ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS fsc_scale_points_user_week_idx
    ON fsc_scale_points (user_id, week_of DESC);

INSERT INTO fsc_scale_points (user_id, week_of, national_avg, cents_per_mile, pct_of_linehaul, regions, note)
SELECT user_id, DATE '2026-11-03', 6.292, 0.86, 0.52,
       '[{"region":"PADD 1A","price":6.416,"cpm":0.88},{"region":"PADD 4","price":6.445,"cpm":0.89},{"region":"PADD 5","price":7.272,"cpm":1.03}]'::jsonb,
       'Ranger fuel surcharge report effective 11/03/26 through 11/09/26'
  FROM settlement_schedules
ON CONFLICT (user_id, week_of) DO NOTHING;
