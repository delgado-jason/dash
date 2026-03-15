
INSERT INTO users (email, password_hash)
VALUES
  ('alice@example.com', '$2b$10$moXk2dFwhi4rayGEZInIgO9ZeG2SkkZOniwwNw7ZxdBqlbc1LvM.C'),
  ('bob@example.com', '$2b$10$moXk2dFwhi4rayGEZInIgO9ZeG2SkkZOniwwNw7ZxdBqlbc1LvM.C'),
  ('charlie@example.com', '$2b$10$moXk2dFwhi4rayGEZInIgO9ZeG2SkkZOniwwNw7ZxdBqlbc1LvM.C'),
  ('jules@example.com', '$2b$10$moXk2dFwhi4rayGEZInIgO9ZeG2SkkZOniwwNw7ZxdBqlbc1LvM.C'),
  ('brandie@example.com', '$2b$10$moXk2dFwhi4rayGEZInIgO9ZeG2SkkZOniwwNw7ZxdBqlbc1LvM.C')
ON CONFLICT (email) DO NOTHING;