-- Multi-user foundation (epic #277). A user is either an account OWNER (admin,
-- parent_user_id NULL) or a DISPATCHER tied to an owner via parent_user_id.
-- Business data stays scoped to the owner's user_id, resolved as account_id at
-- auth (account_id = parent_user_id ?? user_id); identity hangs off the person's
-- own user_id. Existing users default to admin/owner. RLS already on (042).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'admin'
    CHECK (role IN ('admin', 'dispatcher')),
  ADD COLUMN IF NOT EXISTS parent_user_id uuid REFERENCES users(user_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS display_name text;
