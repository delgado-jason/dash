-- Persistent geocode cache for city centers, powering straight-line distance on
-- the Foreman page (who to call from where you'll be empty next). A city center
-- doesn't move, so this is a write-once reference table: geocode a (city, state)
-- via HERE ONCE, validate it, store it, and never call the API for that city
-- again. It is GLOBAL, not per-user (a city's coordinate is the same for everyone),
-- so there's no user_id — RLS is still enabled per the house rule, walling it off
-- from the public PostgREST API; the backend connects as the postgres owner and
-- bypasses RLS.
--
-- status = 'verified' (lat/lng trustworthy — HERE's returned state matched, it
-- resolved to a locality inside US bounds, and cleared the confidence floor) or
-- 'failed' (couldn't be trusted — we store the miss so we don't re-hit HERE every
-- render; lat/lng stay NULL and the Foreman falls back to region-level for it).
-- lat/lng are double precision so they serialize as JSON numbers, not strings.
CREATE TABLE IF NOT EXISTS city_coords (
  city_norm      text NOT NULL,                 -- trimmed + UPPERCASED city
  state          text NOT NULL,                 -- 2-letter UPPERCASED state
  lat            double precision,              -- NULL when status = 'failed'
  lng            double precision,              -- NULL when status = 'failed'
  label          text,                          -- HERE's matched label (audit trail)
  query_score    real,                          -- HERE scoring.queryScore (0–1)
  status         text NOT NULL DEFAULT 'verified'
                   CHECK (status IN ('verified', 'failed')),
  failure_reason text,                          -- why a 'failed' row didn't verify
  geocoded_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (city_norm, state)
);

ALTER TABLE city_coords ENABLE ROW LEVEL SECURITY;
