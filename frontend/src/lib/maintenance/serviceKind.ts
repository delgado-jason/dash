// A KIND on every service (the Maintenance sheet, call 7): one word per row so
// repairs against PM, and tires against everything, become readable. Derived
// where it is obvious, asked once otherwise — the same order the migration
// used to classify the rows on the book, so a row logged tomorrow and a row
// filed last spring read by one rule.
import type { ServiceKind, ServiceUnit } from "@/types/maintenance";

export const KINDS: ReadonlyArray<{ value: ServiceKind; label: string; word: string }> = [
  { value: "pm", label: "PM", word: "scheduled service" },
  { value: "repair", label: "Repair", word: "something broke" },
  { value: "tire", label: "Tire", word: "tires, any position" },
  { value: "wash", label: "Wash", word: "a wash" },
  { value: "inspection", label: "Inspection", word: "an inspection" },
  { value: "reading", label: "Reading", word: "a meter reading, nothing done" },
];

export const kindLabel = (k: ServiceKind | null | undefined): string =>
  KINDS.find((x) => x.value === k)?.label ?? "—";

export const guessKind = (input: {
  description: string;
  itemCount: number;
  unit: ServiceUnit;
  apuHours: number | null;
  cost: number | null;
}): ServiceKind => {
  const d = input.description.toLowerCase();
  if (input.unit === "apu" && input.apuHours != null && !(input.cost && input.cost > 0) && d.includes("reading"))
    return "reading";
  if (d.includes("wash")) return "wash";
  if (d.includes("tire") || d.includes("tyre")) return "tire";
  if (d.includes("inspection") || d.includes("inspect ")) return "inspection";
  if (input.itemCount > 0) return "pm";
  return "repair";
};

// The next kind when the chip on a log row is tapped — cycles in KINDS order.
export const nextKind = (k: ServiceKind | null | undefined): ServiceKind => {
  const i = KINDS.findIndex((x) => x.value === k);
  return KINDS[(i + 1) % KINDS.length].value;
};
