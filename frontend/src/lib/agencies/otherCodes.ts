// The OTHER desks an agency has posted under.
//
// An agency owns a SET of posting codes over time (migration 075 §5d): its own
// agency code, each agent's own code, and desks nobody works any more — Brian
// Williams posted SUU in January and SUH since July, both Momentum. The header
// draws the agency code LIT and every other code in the set DASHED, so this
// hands back the set minus the agency's own code, in a stable order.
//
// Read-only evidence: the settlement feed appends to posting_codes, nothing in
// the UI writes it.

import type { Agency } from "@/types/agency";

// The read shape this needs — nothing more, so a fixture or a partial row can
// answer it without being a whole Agency.
export interface CodedAgencyLike {
  agency_code?: string | null;
  posting_codes?: string[] | null;
}

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

export const otherCodes = (agency: CodedAgencyLike | Agency | null | undefined): string[] => {
  if (!agency) return [];

  const own = clean(agency.agency_code);
  const seen = new Set<string>();

  for (const raw of agency.posting_codes ?? []) {
    const code = clean(raw);
    // Blank entries, the agency's own code, and repeats all drop out.
    if (!code || code === own) continue;
    seen.add(code);
  }

  return [...seen].sort();
};
