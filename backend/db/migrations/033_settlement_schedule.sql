-- Per-user SETTLEMENT SCHEDULE: the carrier's pay % per revenue component, which
-- turns a load's full customer rate (what the shipper pays) into the owner-op's
-- NET — i.e. what their own company grosses after the carrier's cut.
--
-- net = linehaul*(linehaul_pct + trailer_pct) + fuel_surcharge*fuel_surcharge_pct
--       + accessorials*accessorial_pct
--
-- Defaults are 100% / 0% / 100% / 100%, so a user with no row (or one on their own
-- authority) nets the full rate = today's behavior. Nothing changes until a
-- schedule is configured.
--
-- Jason's Landstar BCO split: 65% linehaul + 8% flatbed trailer = 73%, 100% fuel
-- surcharge (seeded separately, per the signed ICOA Appendix A / A-1).
CREATE TABLE IF NOT EXISTS settlement_schedules (
  user_id            uuid PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  linehaul_pct       numeric NOT NULL DEFAULT 1.0 CHECK (linehaul_pct       >= 0 AND linehaul_pct       <= 2),
  trailer_pct        numeric NOT NULL DEFAULT 0.0 CHECK (trailer_pct        >= 0 AND trailer_pct        <= 2),
  fuel_surcharge_pct numeric NOT NULL DEFAULT 1.0 CHECK (fuel_surcharge_pct >= 0 AND fuel_surcharge_pct <= 2),
  accessorial_pct    numeric NOT NULL DEFAULT 1.0 CHECK (accessorial_pct    >= 0 AND accessorial_pct    <= 2),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
