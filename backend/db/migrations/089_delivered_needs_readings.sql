-- A delivered load carries its delivery date and both odometer readings
-- (Jason's call, Nod Sheet "The Protection Stage" P2, 2026-11-05).
--
-- Empty miles, the Friday accrual, utilization and the cost basis all read
-- the end odometer; the cash board and the pay week read the delivery date.
-- A delivered load missing one used to be skipped silently by every number
-- that reads it. The load form and the API now refuse with the sentence
-- "a delivered load needs its end odometer and its delivery date — empty
-- miles, the Friday accrual and break-even all read them"; this is the last
-- line. Counted against prod on 2026-11-07: 0 of 75 delivered loads fail it.
-- Dev's synthetic loads do (130), so the constraint is added NOT VALID and
-- validated where the data allows — new and changed rows are held to it
-- everywhere.
ALTER TABLE loads
  ADD CONSTRAINT loads_delivered_needs_readings
  CHECK (load_status <> 'delivered'
         OR (delivery_date IS NOT NULL AND odometer_start IS NOT NULL AND odometer_end IS NOT NULL))
  NOT VALID;
DO $$
BEGIN
  ALTER TABLE loads VALIDATE CONSTRAINT loads_delivered_needs_readings;
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'loads_delivered_needs_readings left NOT VALID: existing rows violate it (new and changed rows are still held to it)';
END $$;
