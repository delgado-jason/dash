import { useMemo, useState } from "react";
import type { Agent } from "@/types/agent";
import type { Broker } from "@/types/broker";
import { createAgent } from "@/services/createAgentService";
import { createBroker } from "@/services/createBrokerService";
import CityAutocomplete from "@/components/CityAutocomplete";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { PREFERRED } from "@/lib/agents/agentEdit";
import { formatPhone } from "@/lib/phone";
import { nameOf } from "@/lib/relationships/nameOf";
import { RelSheetShell } from "./RelSheetShell";
import { CodeChip, ErrorLine, FieldLabel, GhostButton, PrimaryButton } from "./primitives";

// + Prospect — person first. A name and a way to reach them is enough; the
// agency code is optional and can be created on the spot; a typed code that
// already exists is matched, never duplicated. They land in Prospects.

interface Props {
  open: boolean;
  agents: Agent[];
  brokers: Broker[];
  onClose: () => void;
  onOpenAgent: (agentId: string) => void;
  reload: () => Promise<void>;
  notify: (message: string, action?: { label: string; run: () => void | Promise<void> }) => void;
}

const SOURCE_TABS = [
  { value: "load_board", label: "Load board" },
  { value: "referral", label: "Referral" },
  { value: "directory", label: "Directory" },
  { value: "saw_freight", label: "Saw their freight" },
  { value: "other", label: "Other" },
];

export const ProspectSheet = ({ open, agents, brokers, onClose, onOpenAgent, reload, notify }: Props) => {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [prefers, setPrefers] = useState("");
  const [code, setCode] = useState("");
  const [codeOpen, setCodeOpen] = useState(false);
  const [cityText, setCityText] = useState("");
  const [picked, setPicked] = useState<{ city: string; state: string } | null>(null);
  const [source, setSource] = useState("load_board");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // A code this sheet already created (the brokers prop is stale until the
  // next reload). If the agent create then fails — a 409 duplicate name, say —
  // the retry reuses it instead of tripping UNIQUE(user_id, broker_name).
  const [createdCode, setCreatedCode] = useState<{ name: string; broker_id: string } | null>(null);

  // Duplicate hint as you type — searching EVERY agent by name, whatever code.
  const dup = useMemo(() => {
    const q = `${first} ${last}`.trim().toLowerCase();
    if (q.length < 3) return null;
    return agents.find((a) => nameOf(a).toLowerCase().includes(q)) ?? null;
  }, [agents, first, last]);

  const codeUpper = code.trim().toUpperCase();
  const codeMatches = useMemo(
    () => (codeUpper ? brokers.filter((b) => b.broker_name.toUpperCase().startsWith(codeUpper)).slice(0, 6) : []),
    [brokers, codeUpper],
  );
  const exact = useMemo(
    () => brokers.find((b) => b.broker_name.toUpperCase() === codeUpper) ?? null,
    [brokers, codeUpper],
  );

  const reset = () => {
    setFirst(""); setLast(""); setPhone(""); setEmail(""); setPrefers(""); setCode("");
    setCityText(""); setPicked(null); setSource("load_board"); setNote(""); setErr(null);
    setCreatedCode(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    const f = first.trim();
    const l = last.trim();
    if (!f || !l) return setErr("First and last name are required.");
    if (!phone.trim() && !email.trim()) return setErr("A phone or an email — one way to reach them.");
    const em = email.trim();
    if (em && (!em.includes("@") || !em.includes("."))) return setErr("That doesn't look like an email address.");
    setBusy(true);
    setErr(null);
    try {
      let brokerId: string | null = null;
      if (codeUpper) {
        // A typed code that already exists (unique per user) just matches —
        // in the list, or created by an earlier attempt from this sheet.
        if (exact) brokerId = exact.broker_id;
        else if (createdCode && createdCode.name === codeUpper) brokerId = createdCode.broker_id;
        else {
          const b = await createBroker({ broker_name: codeUpper, phone: null, email: null, rating: null, notes: null });
          setCreatedCode({ name: codeUpper, broker_id: b.broker_id });
          brokerId = b.broker_id;
        }
      }
      // No relationship_tier: a new agent has no tier — the server refuses one.
      const created = await createAgent({
        broker_id: brokerId,
        first_name: f,
        last_name: l,
        phone: phone.trim() || null,
        email: em || null,
        preferred_contact: prefers || null,
        rating: null,
        notes: note.trim() || null,
        agent_city: picked?.city ?? (cityText.trim() ? cityText.split(",")[0].trim() : null),
        agent_state: picked?.state ?? null,
        source,
      });
      await reload();
      const who = `${f} ${l}`;
      notify(`Added · ${who}`, { label: "open", run: () => onOpenAgent(created.agent_id) });
      close();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't add the prospect");
    } finally {
      setBusy(false);
    }
  };

  return (
    <RelSheetShell open={open} onClose={close} title="Add a prospect" description="A new agent to court — lands in Prospects">
      <div className="px-5 pt-5 pb-3 border-b border-hairline">
        <p className="font-display text-[24px] text-ink leading-none">+ PROSPECT</p>
        <p className="font-condensed text-[13px] text-dim mt-1">the person first — the code can come later</p>
      </div>
      <div className="px-5 py-4 grid gap-3">
        {/* one column, person first — First above Last, as the sheet was drawn */}
        <div>
          <FieldLabel htmlFor="pros-first">First name</FieldLabel>
          <input id="pros-first" autoFocus value={first} onChange={(e) => setFirst(e.target.value)} maxLength={50} className="ds-input" />
        </div>
        <div>
          <FieldLabel htmlFor="pros-last">Last name</FieldLabel>
          <input id="pros-last" value={last} onChange={(e) => setLast(e.target.value)} maxLength={50} className="ds-input" />
        </div>
        {dup && (
          <p className="font-condensed text-[13px] text-dim -mt-1">
            Looks like <b className="text-ink">{nameOf(dup)}</b>
            {dup.broker_name ? <> · <CodeChip code={dup.broker_name} /></> : null} —{" "}
            <button
              type="button"
              className="text-amber-hi hover:text-hot"
              onClick={() => {
                const id = dup.agent_id;
                close();
                onOpenAgent(id);
              }}
            >
              open instead?
            </button>
          </p>
        )}
        <div>
          <FieldLabel htmlFor="pros-phone">Phone</FieldLabel>
          <input id="pros-phone" type="tel" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} className="ds-input" />
        </div>
        <div>
          <FieldLabel htmlFor="pros-email">Email</FieldLabel>
          <input id="pros-email" type="text" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={50} className="ds-input" />
        </div>
        <div>
          <FieldLabel>Prefers</FieldLabel>
          <SegmentedTabs tabs={PREFERRED} value={prefers} onChange={setPrefers} size="sm" ariaLabel="Preferred contact" />
        </div>
        <div className="relative">
          <FieldLabel htmlFor="pros-code">Agency code — optional</FieldLabel>
          <input
            id="pros-code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setCodeOpen(true);
            }}
            onFocus={() => setCodeOpen(true)}
            onBlur={() => setTimeout(() => setCodeOpen(false), 150)}
            placeholder="EWT"
            maxLength={10}
            autoComplete="off"
            role="combobox"
            aria-expanded={codeOpen && codeMatches.length > 0}
            className="ds-input uppercase tracking-[.08em]"
          />
          {codeOpen && codeMatches.length > 0 && (
            <ul role="listbox" className="absolute left-0 right-0 z-30 mt-1 p-1 rounded-[9px] border border-hairline bg-panel shadow-xl max-h-52 overflow-y-auto">
              {codeMatches.map((b) => (
                <li key={b.broker_id} role="option" aria-selected={b.broker_id === exact?.broker_id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setCode(b.broker_name.toUpperCase());
                      setCodeOpen(false);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-[6px] font-condensed text-[14px] text-ink hover:bg-white/5"
                  >
                    {b.broker_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="font-condensed text-[11.5px] text-faint mt-1">
            {!codeUpper
              ? "blank is fine — they'll wear NO CODE until you learn it"
              : exact
                ? `matches ${exact.broker_name}`
                : `create ${codeUpper} — a new agency code`}
          </p>
        </div>
        <div>
          <FieldLabel htmlFor="pros-city">Where</FieldLabel>
          <CityAutocomplete
            id="pros-city"
            value={cityText}
            onType={(city) => {
              setCityText(city);
              setPicked(null);
            }}
            onSelect={(city, state) => {
              setCityText(`${city}, ${state}`);
              setPicked({ city, state });
            }}
            placeholder="City, ST"
            inputClassName="ds-input"
          />
        </div>
        <div>
          <FieldLabel>Found them</FieldLabel>
          <SegmentedTabs tabs={SOURCE_TABS} value={source} onChange={setSource} size="sm" ariaLabel="Where you found them" />
        </div>
        <div>
          <FieldLabel htmlFor="pros-note">Note</FieldLabel>
          <input id="pros-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="posts stepdeck freight out of Boise weekly" className="ds-input" />
        </div>
        <ErrorLine>{err}</ErrorLine>
      </div>
      <div className="px-5 pb-5 flex items-center gap-2 flex-wrap">
        <PrimaryButton size="lg" disabled={busy} onClick={() => void submit()}>
          {busy ? "Adding…" : "Add prospect"}
        </PrimaryButton>
        <GhostButton size="lg" onClick={close}>
          Cancel
        </GhostButton>
        <span className="font-condensed text-[12px] text-faint ml-auto">lands in Prospects</span>
      </div>
    </RelSheetShell>
  );
};
