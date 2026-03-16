-- Clear existing data (safe for development)
TRUNCATE TABLE accessorials CASCADE;

-- Alice load accessorial (detention)
INSERT INTO accessorials (
  load_id,
  user_id,
  accessorial_type,
  amount
)
SELECT
  l.load_id,
  l.user_id,
  'detention',
  150.00
FROM loads l
JOIN users u ON l.user_id = u.user_id
WHERE u.email = 'alice@example.com'
LIMIT 1;


-- Bob load accessorial (lumper)
INSERT INTO accessorials (
  load_id,
  user_id,
  accessorial_type,
  amount
)
SELECT
  l.load_id,
  l.user_id,
  'lumper',
  75.00
FROM loads l
JOIN users u ON l.user_id = u.user_id
WHERE u.email = 'bob@example.com'
LIMIT 1;


-- Charlie load accessorial (tarp)
INSERT INTO accessorials (
  load_id,
  user_id,
  accessorial_type,
  amount
)
SELECT
  l.load_id,
  l.user_id,
  'tarp',
  100.00
FROM loads l
JOIN users u ON l.user_id = u.user_id
WHERE u.email = 'charlie@example.com'
LIMIT 1;


-- Jules load accessorial (TONU fee)
INSERT INTO accessorials (
  load_id,
  user_id,
  accessorial_type,
  amount
)
SELECT
  l.load_id,
  l.user_id,
  'tonu_fee',
  350.00
FROM loads l
JOIN users u ON l.user_id = u.user_id
WHERE u.email = 'jules@example.com'
LIMIT 1;