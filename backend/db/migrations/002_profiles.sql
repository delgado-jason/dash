-- 002_profiles.sql

-- If you want UUID generation (choose ONE extension approach)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- or: CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'carrier_type') THEN
    CREATE TYPE carrier_type AS ENUM ('Owner Op', 'Leased Owner Op', 'Company Lease');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  phone_num VARCHAR(10),
  company_name VARCHAR(100),
  carrier_type carrier_type NOT NULL,
  owns_trailer BOOLEAN NOT NULL DEFAULT false,
  home_address VARCHAR(200),
  home_city VARCHAR(50),
  home_state VARCHAR(2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);