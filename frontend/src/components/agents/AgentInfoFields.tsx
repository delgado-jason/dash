import type { ReactNode } from "react";
import type { Agency } from "@/types/agency";
import { agencyOptions } from "@/lib/agencies/agencyOptions";
import { STATES } from "@/lib/constants/states";
import { formatPhone } from "@/lib/phone";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { PREFERRED, type AgentEditDraft } from "@/lib/agents/agentEdit";

// The in-place edit fields for the agent detail page. Dumb by design: the page
// owns the draft and the save; these render it and report keystrokes.

type DraftPatch = Partial<AgentEditDraft>;

const LABEL = "font-condensed text-[11px] tracking-[.1em] uppercase text-faint";
const INPUT =
  "h-[34px] w-full min-w-0 bg-well border border-hairline rounded-[7px] px-2.5 text-sm text-ink";

const Field = ({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) => (
  <div className="flex flex-col gap-1 min-w-0">
    <label htmlFor={id} className={LABEL}>
      {label}
    </label>
    {children}
  </div>
);

export const IdentityFields = ({
  draft,
  onChange,
  agencies,
}: {
  draft: AgentEditDraft;
  onChange: (patch: DraftPatch) => void;
  agencies: Agency[];
}) => {
  // Named agencies read as a book; the ones no bill has named yet fall in by
  // code — the API already ordered them that way (`ORDER BY name NULLS LAST,
  // agency_code`), so agencyOptions only labels them and keeps that order.
  const options = agencyOptions(agencies);
  return (
    <div className="flex flex-col gap-2.5 min-w-0">
      <div className="grid grid-cols-2 gap-2.5">
        <Field id="agent-first-name" label="First name">
          <input
            id="agent-first-name"
            className={INPUT}
            value={draft.first_name}
            maxLength={50}
            onChange={(e) => onChange({ first_name: e.target.value })}
          />
        </Field>
        <Field id="agent-last-name" label="Last name">
          <input
            id="agent-last-name"
            className={INPUT}
            value={draft.last_name}
            maxLength={50}
            onChange={(e) => onChange({ last_name: e.target.value })}
          />
        </Field>
      </div>
      <div className="grid grid-cols-[1.9fr_1fr] gap-2.5">
        <Field id="agent-agency" label="Agency">
          <select
            id="agent-agency"
            className={INPUT}
            value={draft.agency_id}
            onChange={(e) => onChange({ agency_id: e.target.value })}
          >
            {/* A prospect may have no agency yet (073) — blank is a real state. */}
            <option value="">— no code —</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="agent-posting-code" label="Posting code">
          <input
            id="agent-posting-code"
            className={`${INPUT} uppercase tracking-[.08em]`}
            value={draft.posting_code}
            maxLength={3}
            autoComplete="off"
            placeholder="MAM"
            onChange={(e) => onChange({ posting_code: e.target.value.toUpperCase() })}
          />
        </Field>
      </div>
      <div className="grid grid-cols-[1.9fr_1fr] gap-2.5">
        <Field id="agent-city" label="City">
          <input
            id="agent-city"
            className={INPUT}
            value={draft.agent_city}
            maxLength={100}
            onChange={(e) => onChange({ agent_city: e.target.value })}
          />
        </Field>
        <Field id="agent-state" label="State">
          <select
            id="agent-state"
            className={INPUT}
            value={draft.agent_state}
            onChange={(e) => onChange({ agent_state: e.target.value })}
          >
            <option value="">—</option>
            {Object.keys(STATES).map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="text-[11px] text-faint leading-snug">
        Their own code on the freight bill — leave blank if they post under the
        agency's. Loads already booked keep their own agency.
      </p>
    </div>
  );
};

export const ContactFields = ({
  draft,
  onChange,
}: {
  draft: AgentEditDraft;
  onChange: (patch: DraftPatch) => void;
}) => (
  <div className="flex flex-col gap-2.5">
    <Field id="agent-email" label="Email">
      <input
        id="agent-email"
        type="text"
        inputMode="email"
        autoComplete="off"
        className={INPUT}
        value={draft.email}
        maxLength={50}
        onChange={(e) => onChange({ email: e.target.value })}
      />
    </Field>
    <Field id="agent-phone" label="Phone">
      <input
        id="agent-phone"
        type="tel"
        autoComplete="off"
        className={INPUT}
        value={draft.phone}
        onChange={(e) => onChange({ phone: formatPhone(e.target.value) })}
      />
    </Field>
    <div className="flex flex-col gap-1">
      <span className={LABEL}>Preferred</span>
      <SegmentedTabs
        tabs={PREFERRED}
        value={draft.preferred_contact}
        onChange={(v) => onChange({ preferred_contact: v })}
        size="sm"
        ariaLabel="Preferred contact"
      />
    </div>
  </div>
);
