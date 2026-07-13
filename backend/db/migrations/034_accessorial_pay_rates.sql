-- Per-user, per-type accessorial pay rate. A load's accessorials aren't all paid
-- at the same percentage: for Jason's Landstar flatbed, tarp/fuel-surcharge/
-- detention/tolls/loading pay 100%, hazmat/stop-offs and anything unlisted pay
-- 73% (his 65% tractor + 8% trailer, same as linehaul), and excess-value (EVC)
-- pays 0% (Landstar keeps it). Verified against his actual settlement statements.
--
-- Net computation looks up each accessorial's rate here by exact type string; a
-- type with no row falls back to settlement_schedules.accessorial_pct (the user's
-- default). Empty table (or default schedule) keeps net = gross, as before.
CREATE TABLE IF NOT EXISTS accessorial_pay_rates (
  user_id          uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  accessorial_type text NOT NULL,
  pay_pct          numeric NOT NULL DEFAULT 1.0 CHECK (pay_pct >= 0 AND pay_pct <= 2),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, accessorial_type)
);
