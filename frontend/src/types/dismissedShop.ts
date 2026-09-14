// A log name waved off as a one-off stop (11A). The dismissal hides the name
// from the bridge and nothing else — the log rows are untouched, so the counts
// below are read live off the log, not frozen when it was dismissed. numeric
// comes back as a STRING; null is "no cost on any of them", never 0.
export interface DismissedShop {
  dismissal_id: string;
  name: string;
  dismissed_at: string;
  service_count: number;
  total_spend: string | null;
  last_service: string | null;
}
