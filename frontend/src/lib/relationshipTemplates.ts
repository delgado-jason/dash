// The relationship system's email templates (Jason approved the v1 drafts,
// 2026-09-03). Short on purpose — an agent reads forty emails before lunch.
// These fill from live data; Jason edits and sends from HIS OWN email — dash
// drafts and logs, it never sends (authenticity is the product).
import type { Load } from "@/types/load";
import { emptyNextAnchor } from "./metrics/foreman";

const dayName = (k: string): string =>
  new Date(`${k.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });

export interface CapacityDraft {
  subject: string;
  body: string;
  anchorCity: string | null; // null → no committed loads, drafts stay generic
}

// Monday's capacity email — the empty line comes from the same anchor the
// Foreman uses (destination of the furthest-out committed load).
// The DAY you go empty: the furthest committed delivery date (the anchor
// itself only carries the place).
const emptyDay = (loads: Load[]): string | null => {
  const committed = loads.filter(
    (l) => (l.load_status === "booked" || l.load_status === "in_transit") && l.delivery_date,
  );
  if (!committed.length) return null;
  return committed.reduce((best, l) =>
    (l.delivery_date ?? "") > (best.delivery_date ?? "") ? l : best,
  ).delivery_date!.slice(0, 10);
};

export const capacityDraft = (loads: Load[]): CapacityDraft => {
  const a = emptyNextAnchor(loads);
  const d = emptyDay(loads);
  const city = a ? `${a.city}, ${a.state}` : null;
  const when = d ? ` ${dayName(d)}` : "";
  const line = city ? `Empty in ${city}${when}` : "Empty soon";
  return {
    anchorCity: city,
    subject: `${line} — stepdeck available`,
    body:
      `${line}, stepdeck, ready to roll. ` +
      `If you've got anything moving, I'd rather run it for you than the board.\n\n— Jason · DTS`,
  };
};

// The delivery close-out — the thank-you that turns into inbound freight.
export const closeOutDraft = (load: Load, allLoads: Load[]): CapacityDraft => {
  const a = emptyNextAnchor(allLoads);
  const d = emptyDay(allLoads);
  const nextLine = a
    ? ` I'm empty in ${a.city}, ${a.state}${d ? ` ${dayName(d)}` : ""} if anything's moving.`
    : "";
  return {
    anchorCity: a ? `${a.city}, ${a.state}` : null,
    subject: `Delivered — ${load.load_number}, ${load.origin_city} → ${load.destination_city}`,
    body:
      `Delivered and signed clean, no OS&D. Appreciate the freight.` +
      nextLine +
      `\n\n— Jason`,
  };
};
