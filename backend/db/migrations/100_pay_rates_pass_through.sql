-- Tolls are a pass-through reimbursement (Jason's call, Nod Sheet "The
-- Numbers, Site-Wide" Q8, 2026-11-05: "Reimbursed in full, a pass-through";
-- "General Items" Nod Sheet mock 7, call 7 lean A nodded 2026-11-07: tolls
-- only for now — he ticks others as he confirms them).
--
-- A pass-through accessorial is money Landstar hands back for a cost he paid:
-- 100% reaches him, but it is not revenue. It leaves gross, the rate per mile,
-- the booking stats and the earned net; it stays in what the statement pays
-- (the cash board's deposit, the settlement verification) as a reimbursement
-- beside the net (Rule change NET-02). The per-type pay rate still says what
-- share of it the statement pays (Tolls: 100%).
ALTER TABLE accessorial_pay_rates
    ADD COLUMN IF NOT EXISTS pass_through BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE accessorial_pay_rates
   SET pass_through = TRUE, updated_at = NOW()
 WHERE accessorial_type = 'Tolls';
