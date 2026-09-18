import api from "./api";
import type { SiteHit, SiteTraffic, TrafficWindow } from "@/types/siteTraffic";

// hit_id is a bigserial: pg hands back a STRING for bigint, because a bigint
// can outrun a JS number. Nothing here does arithmetic on it — it is a React
// key — but the type says number, so make it one at the door.
const coerceHit = (h: Record<string, unknown>): SiteHit => ({
  hit_id: Number(h.hit_id),
  ts: h.ts as string,
  day: h.day as string, // already 'YYYY-MM-DD' text from the query
  path: h.path as string,
  ref_host: (h.ref_host as string | null) ?? null,
  country: (h.country as string | null) ?? null,
  region: (h.region as string | null) ?? null,
  visitor: h.visitor as string,
  device: (h.device as SiteHit["device"]) ?? "unknown",
});

export const getSiteTraffic = async (
  window: TrafficWindow,
): Promise<SiteTraffic> => {
  const res = await api.get("/site-traffic", { params: { window } });
  return {
    window: res.data.window as TrafficWindow,
    days: Number(res.data.days),
    today: res.data.today as string,
    from: res.data.from as string,
    hits: (res.data.hits as Record<string, unknown>[]).map(coerceHit),
  };
};
