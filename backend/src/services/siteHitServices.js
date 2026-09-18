import { db } from "../../db/pool.js";
import { parseSiteHit } from "../utils/validation/siteHitValidation.js";

// One page view from the website's beacon. The SQL function owns every rule —
// which host counts, the Central-time day, the salted 24-hour visitor hash,
// the per-visitor and site-wide rate limits — and every refusal there is
// silent, so this resolves to nothing either way. The IP rides through as an
// argument and is never written down, here or there.
export async function recordSiteHit(body) {
  const hit = parseSiteHit(body);
  await db.query("SELECT public.record_site_hit($1, $2, $3, $4, $5, $6, $7, $8)", [
    hit.host,
    hit.path,
    hit.ref_host,
    hit.country,
    hit.region,
    hit.ip,
    hit.ua,
    hit.device,
  ]);
}
