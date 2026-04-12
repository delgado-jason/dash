DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'load_type') THEN
    CREATE TYPE load_type AS ENUM (
      'standard flatbed',
      'oversize',
      'hazmat', 
      'heavy haul'
    );
  END IF;
END
$$;

ALTER TABLE loads
    DROP COLUMN origin,
    DROP COLUMN destination,
    ADD COLUMN load_type load_type NOT NULL DEFAULT 'standard flatbed',
    ADD COLUMN broker_id UUID NOT NULL REFERENCES brokers(broker_id) ON DELETE RESTRICT,
    ADD COLUMN agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE RESTRICT,
    ADD COLUMN origin_city VARCHAR(50) NOT NULL,
    ADD COLUMN origin_state CHAR(2) NOT NULL,
    ADD COLUMN destination_city VARCHAR(50) NOT NULL,
    ADD COLUMN destination_state CHAR(2) NOT NULL,
    ADD COLUMN origin_market_id UUID NOT NULL REFERENCES markets(market_id) ON DELETE RESTRICT,
    ADD COLUMN destination_market_id UUID NOT NULL REFERENCES markets(market_id) ON DELETE RESTRICT,
    ADD COLUMN shipper_name VARCHAR(50) NULL,
    ADD COLUMN receiver_name VARCHAR(50) NULL,
    ADD COLUMN commodity VARCHAR(50) NULL,
    ADD COLUMN weight INTEGER NULL,
    ADD COLUMN dimensions VARCHAR(50) NULL,
    ADD COLUMN deadhead_miles INTEGER NULL,
    ADD COLUMN odometer_start INTEGER NULL,
    ADD COLUMN odometer_end INTEGER NULL,

    ADD CONSTRAINT unique_load_number_per_user UNIQUE(load_number, user_id)
;