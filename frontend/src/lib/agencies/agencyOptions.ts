// The agency picker's options: one label per agency, in the order the API
// handed them back.
//
// The API already orders the book — `ORDER BY name ASC NULLS LAST,
// agency_code ASC` — so the named agencies read as a book and the ones no
// freight bill has named yet fall to the end in code order. Re-sorting here by
// `name ?? agency_code` would interleave the two groups and contradict the
// list every other surface shows, so this helper ONLY builds labels and
// preserves its input order.

import type { Agency } from "@/types/agency";

export interface AgencyOption {
  value: string;
  label: string;
}

// The read shape this needs — nothing more.
export interface LabelledAgencyLike {
  agency_id: string;
  agency_code: string;
  name?: string | null;
}

// "CPL · Central Pennsylvania Logistics Inc" once a bill names it; the bare
// code until then — the code is what a person recognises, so it leads either
// way. A name that is blank or whitespace reads as no name at all.
export const agencyLabel = (agency: LabelledAgencyLike): string => {
  const name = (agency.name ?? "").trim();
  return name ? `${agency.agency_code} · ${name}` : agency.agency_code;
};

export const agencyOptions = (
  agencies: readonly (LabelledAgencyLike | Agency)[] | null | undefined,
): AgencyOption[] =>
  (agencies ?? []).map((a) => ({ value: a.agency_id, label: agencyLabel(a) }));
