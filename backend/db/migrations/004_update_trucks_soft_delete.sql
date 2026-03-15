-- Add new ENUM values to truck_status
ALTER TYPE truck_status 
ADD VALUE IF NOT EXISTS 'inactive';

-- Add is_deleted and deleted_at fields 
ALTER TABLE trucks
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE trucks
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;