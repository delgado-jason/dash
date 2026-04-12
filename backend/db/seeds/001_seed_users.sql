-- ============================================================
-- 001_seed_users.sql
-- Password hash = 'password123' for all users
-- ============================================================

INSERT INTO users (user_id, email, password_hash)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'jason@example.com',   '$2b$10$moXk2dFwhi4rayGEZInIgO9ZeG2SkkZOniwwNw7ZxdBqlbc1LvM.C'),
  ('a0000000-0000-0000-0000-000000000002', 'alice@example.com',   '$2b$10$moXk2dFwhi4rayGEZInIgO9ZeG2SkkZOniwwNw7ZxdBqlbc1LvM.C'),
  ('a0000000-0000-0000-0000-000000000003', 'bob@example.com',     '$2b$10$moXk2dFwhi4rayGEZInIgO9ZeG2SkkZOniwwNw7ZxdBqlbc1LvM.C'),
  ('a0000000-0000-0000-0000-000000000004', 'charlie@example.com', '$2b$10$moXk2dFwhi4rayGEZInIgO9ZeG2SkkZOniwwNw7ZxdBqlbc1LvM.C'),
  ('a0000000-0000-0000-0000-000000000005', 'brandie@example.com', '$2b$10$moXk2dFwhi4rayGEZInIgO9ZeG2SkkZOniwwNw7ZxdBqlbc1LvM.C')
ON CONFLICT (email) DO NOTHING;