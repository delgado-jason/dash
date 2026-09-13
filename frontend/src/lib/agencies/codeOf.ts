// Which 3-letter code does a person wear?
//
// A Landstar AGENCY owns one agency code — the shared desk (CPL). The agents
// inside it each post under their own code (MAM, CJY); whoever posts from the
// desk itself has no code of their own and wears the agency's. So the answer
// is the agent's posting code when there is one, otherwise the agency code,
// and null when neither is on file yet — a prospect is a person first, and the
// book draws NO CODE for them until someone learns it.
//
// `kind` is how the chip is drawn (the Agencies Nod Sheet): a posting code
// dashed and dim (.code.post), an agency code lit (.code.home).

export type CodeKind = "posting" | "agency";

export interface AgentCode {
  code: string;
  kind: CodeKind;
}

// The read shape this needs — nothing more, so a row model or a fixture can
// answer it without being a whole Agent.
export interface CodedAgentLike {
  posting_code?: string | null;
  agency_code?: string | null;
}

// Blank, whitespace and null all mean "not on file".
const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

export const codeOf = (agent: CodedAgentLike | null | undefined): AgentCode | null => {
  if (!agent) return null;

  const posting = clean(agent.posting_code);
  const agency = clean(agent.agency_code);

  // Posting the agency's OWN code means working the shared desk — the chip is
  // lit, never dashed. (A row can carry both: the backfill wrote the desk's
  // code onto the person who posts from it.)
  if (posting) {
    return { code: posting, kind: posting === agency ? "agency" : "posting" };
  }

  if (agency) return { code: agency, kind: "agency" };

  return null;
};
