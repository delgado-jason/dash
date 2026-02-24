CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

/*CREATE TYPE carrier_type AS ENUM('Owner Op', 'Leased Owner Op', 'Company Lease');*/

CREATE TABLE IF NOT EXISTS profiles (
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    phone_num VARCHAR(10),
    company_name VARCHAR(100),
    carrier_type CARRIER_TYPE NOT NULL,
    owns_trailer BOOLEAN NOT NULL DEFAULT false,
    home_address VARCHAR(200),
    home_city VARCHAR(50),
    home_state VARCHAR(2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- Make sure updated_at defaults properly
ALTER TABLE profiles
  ALTER COLUMN updated_at SET DEFAULT NOW();

-- Ensure carrier_type column uses the correct enum type name (only if needed)
-- If your enum is named carrier_type, use:
ALTER TABLE profiles 
    ALTER COLUMN carrier_type TYPE carrier_type USING carrier_type::carrier_type;

-- Remove any existing primary key (if you had one)
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_pkey;

-- Remove duplicates BEFORE adding primary key (important!)
-- This keeps only one row per user_id if duplicates exist.
DELETE FROM profiles p
USING profiles p2
WHERE p.user_id = p2.user_id
  AND p.ctid < p2.ctid;

-- Now make user_id the primary key
ALTER TABLE profiles
  ADD CONSTRAINT profiles_pkey PRIMARY KEY (user_id);