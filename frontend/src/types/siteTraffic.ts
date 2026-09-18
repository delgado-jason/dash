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
