-- Compliance documents with renewal/expiry tracking. One row per trackable doc,
-- scoped to the user and optionally linked to a driver / truck / trailer.
--
-- CDL is intentionally NOT stored here: it lives on the driver record (number,
-- state, expiration, endorsements are driver identity). The compliance hub reads
-- it and is the sole edit surface; the driver page shows it read-only. Everything
-- genuinely new -- medical card, DOT inspection, HVUT 2290, registration, UCR,
-- IFTA license, LLC annual report -- lives in this table.

CREATE TABLE IF NOT EXISTS compliance_items (
  compliance_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  scope        text NOT NULL CHECK (scope IN ('business', 'driver', 'truck', 'trailer')),
  driver_id    uuid REFERENCES drivers(driver_id)   ON DELETE CASCADE,
  truck_id     uuid REFERENCES trucks(truck_id)     ON DELETE CASCADE,
  trailer_id   uuid REFERENCES trailers(trailer_id) ON DELETE CASCADE,
  label        text NOT NULL,
  category     text,             -- license | medical | registration | inspection | tax | insurance | authority | other
  issued_on    date,
  expires_on   date,             -- the date the alert engine keys on
  renewal_months integer,        -- cadence, so "mark renewed" can bump the next due date
  warn_lead_days integer NOT NULL DEFAULT 30,
  doc_number   text,
  notes        text,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_items_user ON compliance_items(user_id);
