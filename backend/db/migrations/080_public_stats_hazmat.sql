-- 080 · public stats: a live hazmat load count for the website (Jason,
-- 2026-09-16: "get rid of the states served kpi and replace it with live
-- hazmat load count"). Also the first time this function lives in a
-- migration — it was created by hand in prod in July for the site's
-- public-stats edge function, which does nothing but call it.
--
-- Additive: `states_served` stays in the payload (the site's older builds
-- and the lane map still read it); `hazmat_loads` is added beside
-- `oversize_loads` with the SAME rule — every load of that type, any status,
-- so the two type counts can never disagree about what a "load" is.
-- Aggregates only, no rows, no money — the function is public by design.
CREATE OR REPLACE FUNCTION public.get_public_stats()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with agg as (
    select
      count(*) filter (where load_status = 'delivered')  as loads_delivered,
      coalesce(sum(loaded_miles), 0)                      as loaded_miles,
      count(*) filter (where load_type = 'oversize')      as oversize_loads,
      count(*) filter (where load_type = 'hazmat')        as hazmat_loads
    from public.loads
  ),
  -- Per-state PICKUP counts: where loads originate, not where they deliver.
  pickups as (
    select upper(trim(origin_state)) as st, count(*)::int as n
    from public.loads
    where load_status <> 'cancelled'
      and origin_state is not null
      and trim(origin_state) <> ''
    group by 1
  )
  select json_build_object(
    'loads_delivered', (select loads_delivered from agg),
    'loaded_miles',    (select loaded_miles from agg),
    -- distinct pickup states == number of shaded states on the map
    'states_served',   (select count(*)::int from pickups),
    'oversize_loads',  (select oversize_loads from agg),
    'hazmat_loads',    (select hazmat_loads from agg),
    'states',          coalesce((select json_object_agg(st, n) from pickups), '{}'::json),
    'updated_at',      now()
  );
$function$;
