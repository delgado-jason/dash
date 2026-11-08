-- Snapshot and fuel-entry integrity (stage 4b, 2026-11-07).
--
-- One balance per account per snapshot: a duplicate would double the Ops
-- number the cash board and the Plan page open on. Counted against prod on
-- 2026-11-07: 0 duplicates.
ALTER TABLE snapshot_balances
  ADD CONSTRAINT snapshot_balances_one_per_account UNIQUE (snapshot_id, account_id);
-- fuel_entries.truck_id is NOT NULL (010_fuel_entries.sql), yet its foreign key
-- said ON DELETE SET NULL — a deleted truck would have failed on the NOT NULL
-- in the middle of the delete. Deleting a truck with fills is refused instead.
ALTER TABLE fuel_entries
  DROP CONSTRAINT fk_truck,
  ADD CONSTRAINT fk_truck FOREIGN KEY (truck_id) REFERENCES trucks(truck_id) ON DELETE RESTRICT;
