-- 071: flip stated coverage to confirmed wherever a load already proves it.
-- agent_coverage.source has said 'stated' forever because the insert path
-- never wrote it and no reconciler existed (handoff §7c). createLoad now
-- confirms going forward; this backstop confirms history — the most recent
-- non-cancelled load out of the claimed market becomes the proof.
UPDATE agent_coverage ac
   SET source = 'confirmed',
       confirmed_load_id = m.load_id,
       updated_at = now()
  FROM (
    SELECT DISTINCT ON (l.user_id, l.agent_id, upper(l.origin_city), upper(l.origin_state))
           l.user_id,
           l.agent_id,
           upper(l.origin_city) AS ucity,
           upper(l.origin_state) AS ustate,
           l.load_id
      FROM loads l
     WHERE l.agent_id IS NOT NULL
       AND l.origin_city IS NOT NULL
       AND l.origin_state IS NOT NULL
       AND l.load_status <> 'cancelled'
     ORDER BY l.user_id, l.agent_id, upper(l.origin_city), upper(l.origin_state),
              l.delivery_date DESC NULLS LAST
  ) m
 WHERE ac.user_id = m.user_id
   AND ac.agent_id = m.agent_id
   AND upper(ac.city) = m.ucity
   AND upper(ac.state) = m.ustate
   AND ac.source <> 'confirmed';
