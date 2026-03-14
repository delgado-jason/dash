-- Seed profiles for existing users by matching email

INSERT INTO profiles (
  user_id,
  first_name,
  last_name,
  phone_num,
  company_name,
  carrier_type,
  owns_trailer,
  home_address,
  home_city,
  home_state,
  updated_at
)
SELECT
  u.user_id,
  p.first_name,
  p.last_name,
  p.phone_num,
  p.company_name,
  p.carrier_type,
  p.owns_trailer,
  p.home_address,
  p.home_city,
  p.home_state,
  NOW()
FROM users u
JOIN (VALUES
  ('admin@example.com',    'Jason',  'Delgado', '2145550199', 'Delgado Trucking Services', 'Owner Op'::carrier_type,           TRUE,  '1800 Commerce St',     'Dallas',   'TX'),
  ('alice@example.com', 'Alice',   'Reed',    '8175550142', 'Delgado Trucking Services', 'Company Lease'::carrier_type,      FALSE, '410 W 7th St',         'Fort Worth','TX'),
  ('bob@example.com',  'Bob', 'Vega',    '9725550188', 'Delgado Trucking Services', 'Leased Owner Op'::carrier_type,    TRUE,  '9220 Skillman St',     'Dallas',   'TX')
) AS p(email, first_name, last_name, phone_num, company_name, carrier_type, owns_trailer, home_address, home_city, home_state)
ON u.email = p.email
ON CONFLICT (user_id) DO NOTHING;