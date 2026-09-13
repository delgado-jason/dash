// The call screen's SCRIPT block — ADMIN-02 v1.1 §7 ① (reactivation opener),
// ② (prospecting opener) and the two voicemails ⑤ / ⑥, with the [brackets]
// filled from the agent's record where dash knows the answer and left as
// [brackets] where it doesn't. Suggested language, never sent by dash.
// The caller's name comes from the signed-in user — never a hardcoded name.

export interface ScriptContext {
  agentFirst: string;
  caller: string | null; // the signed-in user's display name
  // Their most recent delivered load, for "[commodity / lane] … back in [month]".
  lastLoad: { commodity: string | null; loadType: string; origin: string; destination: string; month: string | null } | null;
  market: string | null; // "[city / market]" — their top origin, else where they sit
  phone: string | null; // our callback number, if the profile carries one
}

const or = (v: string | null | undefined, bracket: string): string => (v && v.trim() ? v.trim() : bracket);

const laneOf = (c: ScriptContext): string =>
  c.lastLoad
    ? `${c.lastLoad.commodity?.trim() || c.lastLoad.loadType} ${c.lastLoad.origin} → ${c.lastLoad.destination}`
    : "[commodity / lane]";

const monthOf = (c: ScriptContext): string => or(c.lastLoad?.month, "[month]");

export const reactivationOpener = (c: ScriptContext): string =>
  `Hi ${or(c.agentFirst, "[Agent]")}, this is ${or(c.caller, "[Name]")} with Delgado Trucking Services. We hauled ${laneOf(c)} for you back in ${monthOf(c)}. I run dispatch for our truck now, and I'm going through the agents we've worked with to make sure we're on the list when you have flatbed or oversize moving. Do you have a couple of minutes?`;

export const reactivationVoicemail = (c: ScriptContext): string =>
  `Hi ${or(c.agentFirst, "[Agent]")}, ${or(c.caller, "[Name]")} with Delgado Trucking Services — we hauled for you back in ${monthOf(c)}. Just reaching out to reconnect and make sure we're on your list for flatbed and oversize. I'll try you again later this week, or reach me at ${or(c.phone, "[number]")}. Thanks.`;

export const prospectingOpener = (c: ScriptContext): string =>
  `Hi ${or(c.agentFirst, "[Agent]")}, this is ${or(c.caller, "[Name]")} with Delgado Trucking Services — we're a Landstar BCO running a 53-foot flatbed, and we handle oversize as well as standard. I've seen you move freight out of ${or(c.market, "[city / market]")}, and I wanted to put our truck in front of you in case you're ever short on capacity there. Have you got a minute?`;

export const prospectingVoicemail = (c: ScriptContext): string =>
  `Hi ${or(c.agentFirst, "[Agent]")}, ${or(c.caller, "[Name]")} with Delgado Trucking Services, a Landstar BCO — 53-foot flatbed, oversize capable. Calling to introduce our truck in case you're ever short on capacity out of ${or(c.market, "[city / market]")}. Reach me at ${or(c.phone, "[number]")} any time. Thanks.`;

// "Sep" for a 'YYYY-MM-DD' (or ISO) key — the month a load ran, UTC-anchored.
export const monthWord = (key: string | null | undefined): string | null =>
  key
    ? new Date(`${key.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" })
    : null;
