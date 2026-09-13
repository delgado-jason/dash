-- 074 · whose customer is a load (decision 5A). The footprint used to read the
-- ORIGIN as the agent's market on every load; a tradeshow pickup delivered to
-- the agent's customer (2543056, Atlanta → Troutman) made Atlanta a market.
ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS customer_end text NOT NULL DEFAULT 'shipper'
  CHECK (customer_end IN ('shipper', 'receiver', 'neither'));
COMMENT ON COLUMN public.loads.customer_end IS 'which party is the agent''s customer: shipper (origin is the market) · receiver (destination is) · neither (a one-off)';
