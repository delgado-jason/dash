-- Payoff tracking. A debt obligation (Truck Note, Trailer Payment) can carry a
-- loan/lease balance so the asset pages show an "own it outright" tracker, and the
-- Free & Clear / Trailer Paid Off trophies auto-earn when the balance reaches $0.
-- Nullable throughout — a plain obligation (owner draw, personal loan) just leaves
-- them empty. `payoff_date` is the contract end/maturity (exact projection); when
-- null the tracker estimates the payoff at the current payment pace. `asset_id`
-- has no FK because it may point at either trucks or trailers.
ALTER TABLE obligations
  ADD COLUMN IF NOT EXISTS original_balance NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS current_balance  NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS balance_as_of    DATE,
  ADD COLUMN IF NOT EXISTS payoff_date      DATE,
  ADD COLUMN IF NOT EXISTS asset_type       VARCHAR(10),
  ADD COLUMN IF NOT EXISTS asset_id         UUID;
