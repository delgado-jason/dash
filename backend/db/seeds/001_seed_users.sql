
INSERT INTO users (email, password_hash)
VALUES
  ('alice@example.com', '$2b$10$examplehashedpassword1'),
  ('bob@example.com', '$2b$10$examplehashedpassword2'),
  ('charlie@example.com', '$2b$10$examplehashedpassword3')
ON CONFLICT (email) DO NOTHING;