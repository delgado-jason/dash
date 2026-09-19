import api from "./api";
import type {
  KitSyncResult,
  SiteSubscriber,
  SiteSubscribers,
  TrafficWindow,
} from "@/types/siteTraffic";

// subscriber_id is a bigserial: pg hands back a STRING for bigint, because a
// bigint can outrun a JS number. Nothing here does arithmetic on it — it is a
// React key — but the type says number, so make it one at the door. The two
// counts arrive as integers already (count(*)::int), and are coerced anyway:
// the figures strip does arithmetic on them.
const coerceSubscriber = (s: Record<string, unknown>): SiteSubscriber => ({
  subscriber_id: Number(s.subscriber_id),
  email: s.email as string,
  ts: s.ts as string,
  day: s.day as string, // already 'YYYY-MM-DD' text from the query
  source_path: (s.source_path as string | null) ?? null,
  kit_status: (s.kit_status as SiteSubscriber["kit_status"]) ?? "pending",
});

export const getSiteSubscribers = async (
  window: TrafficWindow,
): Promise<SiteSubscribers> => {
  const res = await api.get("/site-subscribers", { params: { window } });
  return {
    window: res.data.window as TrafficWindow,
    days: Number(res.data.days),
    today: res.data.today as string,
    from: res.data.from as string,
    total: Number(res.data.total),
    window_count: Number(res.data.window_count),
    latest: (res.data.latest as Record<string, unknown>[]).map(coerceSubscriber),
  };
};

// One press of "Sync to Kit": pushes the waiting rows and asks Kit about the
// ones it already holds. Every count is coerced — they are integers on the
// wire, and the note the page writes does arithmetic-free string work on them.
export const syncSiteSubscribers = async (): Promise<KitSyncResult> => {
  const res = await api.post("/site-subscribers/sync");
  const d = res.data as Record<string, unknown>;
  const n = (v: unknown) => (v == null ? undefined : Number(v));
  return {
    skipped: Boolean(d.skipped),
    reason: (d.reason as string | undefined) ?? undefined,
    sent: n(d.sent),
    failed: n(d.failed),
    checked: n(d.checked),
    confirmed: n(d.confirmed),
    unsubscribed: n(d.unsubscribed),
  };
};
