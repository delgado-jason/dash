INSERT INTO drivers (
  user_id,
  first_name,
  last_name,
  active
)
SELECT
  user_id,
  'Alice',
  'Driver',
  true
FROM users
WHERE email = 'alice@example.com'

UNION ALL

SELECT
  user_id,
  'Bob',
  'Driver',
  true
FROM users
WHERE email = 'bob@example.com'

UNION ALL

SELECT
  user_id,
  'Charlie',
  'Driver',
  true
FROM users
WHERE email = 'charlie@example.com'

UNION ALL

SELECT
  user_id,
  'Jules',
  'Driver',
  true
FROM users
WHERE email = 'jules@example.com'

UNION ALL

SELECT
  user_id,
  'Brandie',
  'Driver',
  true
FROM users
WHERE email = 'brandie@example.com';