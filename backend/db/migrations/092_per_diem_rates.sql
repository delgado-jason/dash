-- Per diem becomes dated rates (Jason's call, Nod Sheet "The Numbers,
-- Site-Wide" GL-136, 2026-11-05: "Dated rates" — $69 before 2026, $80 from
-- Jan 1, 2026, a new row when the IRS publishes, past years keep what they
-- were filed at; "General Items" Nod Sheet mock 1, call 1 lean A nodded
-- 2026-11-07: a row starts on the day the IRS rate changes).
--
-- One row per user per start date. The Per Diem page prices each day by the
-- row in force that day (the latest effective_from on or before it); a day
-- before the first row has NO rate and is refused, never priced at 0 or at a
-- guessed rate. settlement_schedules.per_diem_rate (migration 041, one undated
-- number) stops being read or written by the code with this build; the column
-- is dropped by a later migration once nothing names it.
CREATE TABLE IF NOT EXISTS per_diem_rates (
    rate_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    effective_from DATE NOT NULL,
    rate           NUMERIC(6,2) NOT NULL
                   CONSTRAINT per_diem_rates_rate_range CHECK (rate > 0 AND rate <= 500),
    note           TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT per_diem_rates_one_per_start UNIQUE (user_id, effective_from)
);

ALTER TABLE per_diem_rates ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS per_diem_rates_user_from_idx
    ON per_diem_rates (user_id, effective_from DESC);

-- The decided rows, for every account that has a settlement schedule (the
-- owners; a dispatcher reads the owner's). Idempotent: re-running adds nothing.
INSERT INTO per_diem_rates (user_id, effective_from, rate, note)
SELECT user_id, DATE '2025-01-01', 69.00,
       'the rate 2025 was filed at — kept so past years never move'
  FROM settlement_schedules
ON CONFLICT (user_id, effective_from) DO NOTHING;

INSERT INTO per_diem_rates (user_id, effective_from, rate, note)
SELECT user_id, DATE '2026-01-01', 80.00,
       'IRS FY2026 transportation rate'
  FROM settlement_schedules
ON CONFLICT (user_id, effective_from) DO NOTHING;
