// One page view on delgadotruckingservices.com, as the beacon wrote it
// (migration 081). Everything here is already normalised by the database
// function — the page never has to clean a path or a host.
export interface SiteHit {
  hit_id: number;
  ts: string; // an INSTANT (timestamptz → ISO); formatted in Central when shown
  day: string; // 'YYYY-MM-DD', the Central-time day — a string, never a Date
  path: string;
  ref_host: string | null; // the referring site's host; null = direct
  country: string | null; // ISO 3166-1 alpha-2
  region: string | null; // state code for US
  visitor: string; // the 24-hour hash — a browser-on-a-day, not a person
  device: "desktop" | "mobile" | "tablet" | "unknown";
}

export type TrafficWindow = "7d" | "30d" | "90d" | "12m";

// `today` and `from` are the window's bounds as the DATABASE read the clock,
// in Central time. Every figure on the page is counted between them, so the
// page never asks the browser what day it is.
export interface SiteTraffic {
  window: TrafficWindow;
  days: number;
  today: string; // 'YYYY-MM-DD'
  from: string; // 'YYYY-MM-DD'
  hits: SiteHit[];
}

// One signup from the Logbook's form (migration 082). Unlike a hit, this IS a
// person — the address is kept as typed, and there is no IP or browser here to
// keep alongside it.
export interface SiteSubscriber {
  subscriber_id: number;
  email: string;
  ts: string; // an INSTANT (timestamptz → ISO); formatted in Central when shown
  day: string; // 'YYYY-MM-DD', the Central-time day — a string, never a Date
  source_path: string | null; // the entry the form was on
  // Where the address stands with Kit, which does the sending. `pending` is
  // also what every row looks like before the Kit key reaches Railway.
  kit_status: "pending" | "sent" | "confirmed" | "unsubscribed" | "failed";
}

// `total` is the whole list and ignores the window; `window_count` is the
// signups inside it. Both are counted against the same Central bounds the
// traffic boards use.
export interface SiteSubscribers {
  window: TrafficWindow;
  days: number;
  today: string; // 'YYYY-MM-DD'
  from: string; // 'YYYY-MM-DD'
  total: number;
  window_count: number;
  latest: SiteSubscriber[];
}

// What POST /site-subscribers/sync answers: either Kit isn't configured yet,
// or the counts of what one press moved and learned.
export interface KitSyncResult {
  skipped: boolean;
  reason?: string;
  sent?: number;
  failed?: number;
  checked?: number;
  confirmed?: number;
  unsubscribed?: number;
}
