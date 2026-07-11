-- Trophy room. One row per (user, trophy_key). `earned_on` is null while a
-- trophy is locked and set when it's won — manually for the milestones the app
-- can't detect (owner-operator, own authority, truck/trailer paid off) and
-- stamped automatically for the data-driven ones (mile clubs, fleet size,
-- lifetime hauled). `image_url` holds the AI-generated trophy art once approved.
CREATE TABLE IF NOT EXISTS trophies (
  trophy_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  trophy_key text NOT NULL,
  earned     boolean NOT NULL DEFAULT false, -- won or not (auto ones are also computed live)
  earned_on  date,        -- when it was won, if known (null even when earned)
  image_url  text,        -- AI-generated art, null until generated + approved
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_trophy_per_user UNIQUE (user_id, trophy_key)
);

CREATE INDEX IF NOT EXISTS idx_trophies_user ON trophies(user_id);
