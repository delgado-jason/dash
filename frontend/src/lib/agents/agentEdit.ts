import type { Agent } from "@/types/agent";
import type { AgentPatchPayload } from "@/types/agentPatchPayload";

// The in-place "Edit info" form on the agent detail page: a string draft of
// every editable identity/contact field, and the diff that becomes the PATCH.
// Rating, tier and standing notes are deliberately not part of this draft — a
// rating change needs a reason + initials and rolls the whole request back
// without them, so the identity payload can never carry one by construction.

export type AgentEditDraft = {
  first_name: string;
  last_name: string;
  agency_id: string;
  // Their own code on the freight bill — blank means they post from the
  // agency's desk, under its agency code.
  posting_code: string;
  agent_city: string;
  agent_state: string;
  phone: string;
  email: string;
  preferred_contact: string;
};

// preferred_contact is a Postgres enum ('phone' | 'email' | 'text'); the
// labels are how a dispatcher says them. The column is nullable and every
// cold-pool prospect starts with null, so a blank draft value means "nobody
// has asked yet" — it is left alone, never forced to a pick.
export const PREFERRED: { value: string; label: string }[] = [
  { value: "phone", label: "Call" },
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
];

const PREFERRED_VALUES = PREFERRED.map((p) => p.value);

// Lengths mirror the varchar caps on the agents table.
const NAME_MAX = 50;
const CONTACT_MAX = 50;
const CITY_MAX = 100;

export const draftFromAgent = (agent: Agent): AgentEditDraft => ({
  first_name: agent.first_name ?? "",
  last_name: agent.last_name ?? "",
  agency_id: agent.agency_id ?? "",
  posting_code: agent.posting_code ?? "",
  agent_city: agent.agent_city ?? "",
  agent_state: agent.agent_state ?? "",
  phone: agent.phone ?? "",
  email: agent.email ?? "",
  preferred_contact: agent.preferred_contact ?? "",
});

// Plain-English message for the first rule the draft breaks; null when it is
// good to send.
export const validateDraft = (d: AgentEditDraft): string | null => {
  const first = d.first_name.trim();
  const last = d.last_name.trim();
  if (!first) return "First name is required.";
  if (!last) return "Last name is required.";
  if (first.length > NAME_MAX)
    return `First name can't be longer than ${NAME_MAX} characters.`;
  if (last.length > NAME_MAX)
    return `Last name can't be longer than ${NAME_MAX} characters.`;

  if (d.phone.trim().length > CONTACT_MAX)
    return `Phone can't be longer than ${CONTACT_MAX} characters.`;

  const email = d.email.trim();
  if (email.length > CONTACT_MAX)
    return `Email can't be longer than ${CONTACT_MAX} characters.`;
  if (email && (!email.includes("@") || !email.includes(".")))
    return "That doesn't look like an email address.";

  if (d.agent_city.trim().length > CITY_MAX)
    return `City can't be longer than ${CITY_MAX} characters.`;

  const state = d.agent_state.trim();
  if (state && !/^[A-Za-z]{2}$/.test(state))
    return "State should be the 2-letter code.";

  const posting = d.posting_code.trim();
  if (posting && !/^[A-Za-z]{3}$/.test(posting))
    return "A posting code is 3 letters — leave it blank if they post under the agency's.";

  if (d.preferred_contact && !PREFERRED_VALUES.includes(d.preferred_contact))
    return "Pick how they prefer to be reached.";

  return null;
};

// Trimmed text, with blank collapsed to null — so "" in the form and null in
// the row read as the same thing.
const norm = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

const normState = (v: string | null | undefined): string | null =>
  norm(v)?.toUpperCase() ?? null;

// Only the fields whose value actually differs from the agent — nothing to send
// comes back as null.
export const buildAgentPatch = (
  agent: Agent,
  d: AgentEditDraft,
): AgentPatchPayload | null => {
  const patch: AgentPatchPayload = {};

  const first = d.first_name.trim();
  if (first !== agent.first_name.trim()) patch.first_name = first;

  const last = d.last_name.trim();
  if (last !== agent.last_name.trim()) patch.last_name = last;

  // The agency is optional (073): a blank pick clears it to null, and a
  // codeless agent whose draft is still blank is not a change.
  if (d.agency_id !== (agent.agency_id ?? "")) patch.agency_id = d.agency_id || null;

  // Their own posting code. Blank clears it back to the agency's desk; the
  // column is varchar(3) and the server insists on 3 uppercase letters, so
  // send what validateDraft already checked.
  const posting = norm(d.posting_code)?.toUpperCase() ?? null;
  if (posting !== (norm(agent.posting_code)?.toUpperCase() ?? null))
    patch.posting_code = posting;

  const city = norm(d.agent_city);
  if (city !== norm(agent.agent_city)) patch.agent_city = city;

  const state = normState(d.agent_state);
  if (state !== normState(agent.agent_state)) patch.agent_state = state;

  const phone = norm(d.phone);
  if (phone !== norm(agent.phone)) patch.phone = phone;

  const email = norm(d.email);
  if (email !== norm(agent.email)) patch.email = email;

  if (d.preferred_contact !== (agent.preferred_contact ?? ""))
    patch.preferred_contact = d.preferred_contact;

  return Object.keys(patch).length === 0 ? null : patch;
};
