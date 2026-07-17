-- 048: dispatcher attribution + user avatars (multi-user Phase 3a)
--
-- `booked_by` records WHO booked each load, so a dispatcher's card can count
-- only the loads they personally booked (Jason and Brandie both book; she should
-- get credit for hers). New loads default booked_by to the logged-in creator;
-- existing loads are attributed to the account owner, who booked all history.
--
-- loads.user_id is the ACCOUNT id under delegated access (= the owner/admin's
-- user_id), so `booked_by = user_id` backfills every existing load to the owner.
ALTER TABLE loads
  ADD COLUMN IF NOT EXISTS booked_by uuid REFERENCES users(user_id) ON DELETE SET NULL;

UPDATE loads SET booked_by = user_id WHERE booked_by IS NULL;

-- A user's own avatar (their dispatcher card + team pages) — same idea as the
-- trucks/drivers/trailers avatar_url, but keyed to the login.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url varchar(500);

-- No RLS statement: this migration only ALTERs existing tables (loads + users
-- already have RLS enabled); the convention only requires ENABLE on new tables.
