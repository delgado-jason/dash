-- Make VIN optional
ALTER TABLE trucks
ALTER COLUMN vin DROP NOT NULL;

-- Add friendly truck name
ALTER TABLE trucks
ADD COLUMN truck_name VARCHAR(50);

ALTER TABLE trucks
ADD CONSTRAINT unique_user_truck_name
UNIQUE (user_id, truck_name);