import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Lock, Mail, MessageSquare, Phone } from "lucide-react";
import type { Agent } from "@/types/agent";
import type { Load } from "@/types/load";
import type { AgentPatchPayload } from "@/types/agentPatchPayload";
import type { RateLadder } from "@/lib/metrics/rateTargets";
import { rpm as fmtRpm } from "@/lib/format";
import { patchAgent } from "@/services/patchAgentService";
import {
  createAgentContact,
  deleteAgentContact,
  patchAgentContact,
  type AgentContact,
} from "@/services/agentContactsService";
import type { AgentCoverage } from "@/services/agentCoverageService";
import CoverageEditor from "./CoverageEditor";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { originMarketsByAgent } from "@/lib/metrics/agentTouches";
import { bucketLabel, bucketOf, isDormant } from "@/lib/relationships/buckets";
import { agentAllInRpm, deliveredCount } from "@/lib/relationships/agentRpm";
import { daysSinceMeaningful } from "@/lib/relationships/meaningfulContact";
import {
  ESTABLISHED_AT,
  bandLabel,
  isEstablished,
  suggestBucket,
  suggestionLabel,
  type BucketSuggestion,
} from "@/lib/relationships/tierSuggestion";
import { contactTypeLabel } from "@/lib/relationships/contactTypes";
import { PREFERRED } from "@/lib/agents/agentEdit";
import { formatPhone } from "@/lib/phone";
import { nameOf } from "@/lib/relationships/nameOf";
import { RelSheetShell } from "./RelSheetShell";
import { LogTouchForm, type ClassPin, type FoldPayload, type LogTouchPayload, type TouchPrefill } from "./LogTouchForm";
import {
  CodeChip,
  ErrorLine,
  FieldLabel,
  GhostButton,
  GhostLink,
  ParkedChip,
  PrimaryButton,
  PrimaryLink,
  SectionHead,
} from "./primitives";

// The agent sheet — everything about one agent Brandie needs on the phone:
// reach them, log the touch, see their markets, fix their contact details;
// and for the owner, set the tier (with the suggestion and its evidence) and
// park / unpark. Every write shows its error by name; nothing closes on a
// failure.

interface Props {
  agent: Agent;
  loads: Load[];
  contacts: AgentContact[];
  coverage: AgentCoverage[];
  ladder: RateLadder | null;
  now: Date;
  // false when the loads slice didn't come through: no load count, RPM,
  // suggestion or dormancy is claimed — a failed fetch must never prefill a
  // demotion's reason.
  loadsReady?: boolean;
  isAdmin: boolean;
  prefill?: TouchPrefill;
  onClose: () => void;
  reload: () => Promise<void>;
  notify: (message: string, action?: { label: string; run: () => void | Promise<void> }) => void;
}

type Busy = null | "log" | "fold" | "tier" | "park" | "unpark" | "contact";
type ErrWhere = "log" | "class" | "fold" | "tier" | "park" | "contact";

const telHref = (phone: string) => `tel:${phone.replace(/[^+\d]/g, "")}`;
const smsHref = (phone: string) => `sms:${phone.replace(/[^+\d]/g, "")}`;
const weekdayOf = (iso: string): string => new Date(iso).toLocaleDateString("en-US", { weekday: "short" });

// Preferred contact reads 'phone' | 'email' | 'text' in the column.
const prefersWord = (v: string | null): string | null =>
  v === "phone" ? "call" : v === "text" ? "text" : v === "email" ? "email" : null;

type TierPick = 1 | 2 | 3 | "none";
const TIER_TABS: { value: TierPick; label: string }[] = [
  { value: 1, label: "Tier 1" },
  { value: 2, label: "Tier 2" },
  { value: 3, label: "Tier 3" },
  { value: "none", label: "Prospect (no tier)" },
];
const tierOfSuggestion = (s: BucketSuggestion): TierPick | null =>
  s === "tier1" ? 1 : s === "tier2" ? 2 : s === "tier3" ? 3 : s === "prospect" ? "none" : null;
const tierPickOf = (tier: number | null): TierPick => (tier === 1 || tier === 2 || tier === 3 ? tier : "none");

export const AgentSheet = ({
  agent,
  loads,
  contacts,
  coverage,
  ladder,
  now,
  loadsReady = true,
  isAdmin,
  prefill,
  onClose,
  reload,
  notify,
}: Props) => {
  const [busy, setBusy] = useState<Busy>(null);
  const [err, setErr] = useState<{ where: ErrWhere; message: string } | null>(null);
  const [editMarkets, setEditMarkets] = useState(false);
  const [editContact, setEditContact] = useState(false);
  const [phone, setPhone] = useState(agent.phone ?? "");
  const [email, setEmail] = useState(agent.email ?? "");
  const [preferred, setPreferred] = useState(agent.preferred_contact ?? "");
  const [bestTime, setBestTime] = useState(agent.best_time_to_call ?? "");
  const [parkReason, setParkReason] = useState("");

  const ctx = useMemo(() => ({ loads, contacts, now, loadsReady }), [loads, contacts, now, loadsReady]);
  const bucket = useMemo(() => bucketOf(agent, ctx), [agent, ctx]);
  const explicitlyParked = agent.work_status === "parked";
  // Dormancy is judged on its own, parked or not: an owner-parked agent who is
  // ALSO dormant would not become a Prospect on unpark — the button says so.
  const dormant = useMemo(
    () => loadsReady && agent.relationship_tier == null && isDormant(agent, loads, contacts, now),
    [agent, loadsReady, loads, contacts, now],
  );
  const delivered = useMemo(() => deliveredCount(loads, agent.agent_id), [loads, agent.agent_id]);
  const rpm = useMemo(() => agentAllInRpm(loads, agent.agent_id, now), [loads, agent.agent_id, now]);
  const suggestion = useMemo(
    () => (loadsReady ? suggestBucket(agent, { deliveredCount: delivered, rpm: rpm.rpm, ladder, dormant }) : null),
    [agent, loadsReady, delivered, rpm.rpm, ladder, dormant],
  );
  const daysSince = useMemo(
    () => daysSinceMeaningful(agent.agent_id, contacts, loads, now),
    [agent.agent_id, contacts, loads, now],
  );
  const hauledFrom = useMemo(
    () => originMarketsByAgent(loads.filter((l) => l.agent_id === agent.agent_id)).get(agent.agent_id) ?? [],
    [loads, agent.agent_id],
  );
  const stated = useMemo(() => coverage.filter((c) => c.agent_id === agent.agent_id), [coverage, agent.agent_id]);

  // The owner block's evidence line and the pre-highlighted button.
  const established = loadsReady && isEstablished(delivered);
  const evidence = !loadsReady
    ? "loads didn't come through — no suggestion until they do"
    : established
      ? [rpm.rpm != null ? `${fmtRpm(rpm.rpm)} all-in${rpm.partial ? " (partial miles)" : ""}` : "no RPM yet", bandLabel(rpm.rpm, ladder), `${delivered} loads`]
          .filter(Boolean)
          .join(" · ")
      : `${delivered} of ${ESTABLISHED_AT} loads — not yet established`;
  const recommended = tierOfSuggestion(suggestion);
  const [pendingTier, setPendingTier] = useState<TierPick>(recommended ?? tierPickOf(agent.relationship_tier));
  // The reason prefills from the evidence — never from a failed fetch.
  const [reason, setReason] = useState(loadsReady ? evidence : "");
  const currentPick = tierPickOf(agent.relationship_tier);

  const name = nameOf(agent);
  const isProspect = agent.relationship_tier == null;
  const reasonRequired = (agent.agent_class ?? "") !== "spot";

  const run = async (which: Exclude<Busy, null>, where: ErrWhere, fn: () => Promise<void>) => {
    setBusy(which);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr({ where, message: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setBusy(null);
    }
  };

  // The one question's answer is an AGENT patch, written LAST — after the
  // contact is logged or folded. A failure here leaves the touch recorded and
  // the agent still recoverable in the queue, never the reverse.
  const pinClass = async (pin: ClassPin) => {
    const patch: AgentPatchPayload = { agent_class: pin.agent_class };
    if (pin.park) {
      patch.work_status = "parked";
      if (pin.parkReason) patch.park_reason = pin.parkReason;
    }
    await patchAgent(agent.agent_id, patch);
  };

  // The tail every contact write shares: class pin (if any), refresh, close.
  // `did` names what already saved, so the error reads "Folded, but…".
  const finishContactWrite = async (classPin: ClassPin | null, did: string) => {
    if (classPin) {
      try {
        await pinClass(classPin);
      } catch (e) {
        await reload();
        setErr({ where: "class", message: `${did}, but the class didn't save — ${e instanceof Error ? e.message : "try again"}` });
        setBusy(null);
        return;
      }
    }
    await reload();
    setBusy(null);
    onClose();
  };

  // LOG: the contact first, the class pin last.
  const onLog = async (p: LogTouchPayload) => {
    setBusy("log");
    setErr(null);
    let created: AgentContact;
    try {
      created = await createAgentContact(p.contact);
    } catch (e) {
      setErr({ where: "log", message: e instanceof Error ? e.message : "Couldn't log the touch" });
      setBusy(null);
      return;
    }
    const undo = async () => {
      await deleteAgentContact(created.contact_id);
      await reload();
    };
    notify(`Logged · ${name} · ${contactTypeLabel(p.contact.type)}`, { label: "undo", run: undo });
    await finishContactWrite(p.classPin, "Touch logged");
  };

  // FOLD: the week's first message grows by this reason and carries the form's
  // follow-up (the form built the PATCH and already refused a reason the
  // message carries); the class pin still goes last, exactly as on a log.
  const onFold = async (p: FoldPayload) => {
    setBusy("fold");
    setErr(null);
    try {
      await patchAgentContact(p.into.contact_id, p.patch);
    } catch (e) {
      setErr({ where: "fold", message: e instanceof Error ? e.message : "Couldn't fold the touch" });
      setBusy(null);
      return;
    }
    notify(`Folded · ${name} · ${contactTypeLabel(p.type)} into ${weekdayOf(p.into.contacted_at)}'s message`);
    await finishContactWrite(p.classPin, "Folded");
  };

  const applyTier = () =>
    run("tier", "tier", async () => {
      const relationship_tier = pendingTier === "none" ? null : pendingTier;
      await patchAgent(agent.agent_id, { relationship_tier, reason: reason.trim() });
      notify(`Tier set · ${name} · ${pendingTier === "none" ? "Prospect" : `Tier ${pendingTier}`}`);
      await reload();
    });

  const park = () =>
    run("park", "park", async () => {
      await patchAgent(agent.agent_id, {
        work_status: "parked",
        ...(parkReason.trim() ? { park_reason: parkReason.trim() } : {}),
      });
      notify(`Parked · ${name}`);
      await reload();
    });

  const unpark = () =>
    run("unpark", "park", async () => {
      // park_reason stays on the record — it's history, not state.
      await patchAgent(agent.agent_id, { work_status: "active" });
      // A dormant agent stays Parked (derived) after the unpark — promise nothing else.
      notify(dormant ? `Unparked · ${name} — still dormant until a two-way contact` : `Unparked · ${name}`);
      await reload();
    });

  const saveContact = () =>
    run("contact", "contact", async () => {
      const patch: AgentPatchPayload = {};
      const norm = (v: string) => (v.trim() === "" ? null : v.trim());
      if (norm(phone) !== (agent.phone ?? null)) patch.phone = norm(phone);
      if (norm(email) !== (agent.email ?? null)) patch.email = norm(email);
      if (preferred && preferred !== (agent.preferred_contact ?? "")) patch.preferred_contact = preferred;
      if (norm(bestTime) !== (agent.best_time_to_call ?? null)) patch.best_time_to_call = norm(bestTime);
      if (Object.keys(patch).length > 0) await patchAgent(agent.agent_id, patch);
      await reload();
      setEditContact(false);
    });

  const errFor = (where: ErrWhere) => (err?.where === where ? err.message : null);
  const prefers = prefersWord(agent.preferred_contact);
  // Where an unpark lands them: their tier; a Prospect; or — dormant — still
  // Parked by derivation until a two-way contact.
  const unparkLabel = dormant
    ? "Unpark — dormant; stays Parked until a two-way contact"
    : `Unpark — back into the book as ${agent.relationship_tier != null ? `Tier ${agent.relationship_tier}` : "a Prospect"}`;

  return (
    <RelSheetShell open onClose={onClose} title={name} description={`${bucketLabel(bucket)} · agent sheet`}>
      {/* ---- header ---- */}
      <div className="px-5 pt-5 pb-4 border-b border-hairline">
        <div className="flex items-center gap-2.5 flex-wrap">
          <Link to={`/agents/${agent.agent_id}`} className="font-display text-[26px] text-amber leading-none hover:text-hot transition-colors">
            {name}
          </Link>
          <CodeChip code={agent.broker_name} />
          {bucket === "parked" && <ParkedChip />}
        </div>
        <p className="font-condensed text-[13.5px] text-dim mt-1.5">
          {bucketLabel(bucket)} ·{" "}
          {loadsReady
            ? `${delivered} load${delivered === 1 ? "" : "s"} · ${rpm.rpm != null ? `${fmtRpm(rpm.rpm)} all-in` : "no RPM yet"}`
            : "loads didn't come through"}
          {prefers ? ` · prefers ${prefers}` : ""}
          {!loadsReady ? "" : daysSince != null ? ` · ${daysSince}d since contact` : " · never a two-way contact"}
        </p>
      </div>

      {/* ---- reach them ---- */}
      <div className="flex gap-2 flex-wrap px-5 py-3 border-b border-hairline-lo">
        {agent.phone ? (
          <>
            <PrimaryLink size="lg" href={telHref(agent.phone)}>
              <Phone size={16} /> {agent.phone}
            </PrimaryLink>
            <GhostLink size="lg" href={smsHref(agent.phone)}>
              <MessageSquare size={15} /> Text
            </GhostLink>
          </>
        ) : null}
        {agent.email ? (
          <GhostLink size="lg" href={`mailto:${agent.email}`}>
            <Mail size={15} /> Email
          </GhostLink>
        ) : null}
        {!agent.phone && !agent.email && (
          <p className="font-condensed text-[13px] text-faint">no phone or email on file — add them under Contact</p>
        )}
      </div>

      {/* ---- log a touch ---- */}
      <SectionHead>Log a touch</SectionHead>
      <div className="px-5 pb-4">
        <LogTouchForm
          agent={agent}
          contacts={contacts}
          deliveredCount={delivered}
          now={now}
          isAdmin={isAdmin}
          isProspect={isProspect}
          prefill={prefill}
          busy={busy === "log" || busy === "fold"}
          error={errFor("log") ?? errFor("class") ?? errFor("fold")}
          onLog={onLog}
          onFold={onFold}
        />
      </div>

      {/* ---- markets ---- */}
      <SectionHead
        right={
          <button type="button" onClick={() => setEditMarkets((v) => !v)} className="hover:text-hot">
            {editMarkets ? "done" : "edit"}
          </button>
        }
      >
        Markets
      </SectionHead>
      <div className="px-5 pb-4">
        {hauledFrom.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-2">
            {hauledFrom.map((m) => (
              <span
                key={`${m.city},${m.state}`}
                title="Proven — a load has come out of this market"
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[8px] border border-status-positive-text/60 bg-status-positive-text/10 font-condensed text-[12.5px] text-ink"
              >
                {m.city.toUpperCase()} {m.state.toUpperCase()} <span className="text-dim">×{m.n}</span>
              </span>
            ))}
          </div>
        )}
        {editMarkets ? (
          <CoverageEditor agentId={agent.agent_id} rows={stated} onChanged={() => void reload()} emptyText="No stated markets yet" />
        ) : stated.length > 0 ? (
          <div className="flex gap-2 flex-wrap">
            {stated.map((c) => (
              <span
                key={c.coverage_id}
                title={c.source === "confirmed" ? "Confirmed — a load has come out of this market" : "Stated — they said so; no load from here yet"}
                className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[8px] border font-condensed text-[12.5px] text-ink ${
                  c.source === "confirmed" ? "border-status-positive-text/60 bg-status-positive-text/10" : "border-dashed border-dim bg-white/5"
                }`}
              >
                {c.city}, {c.state}
                {c.shipper_name && <span className="text-dim">{c.shipper_name}</span>}
              </span>
            ))}
          </div>
        ) : hauledFrom.length === 0 ? (
          <p className="font-condensed text-[13px] text-faint">no markets yet — hauled-from fills in from their loads, stated ones from a call</p>
        ) : null}
      </div>

      {/* ---- contact ---- */}
      <SectionHead
        right={
          !editContact ? (
            <button type="button" onClick={() => setEditContact(true)} className="hover:text-hot">
              edit
            </button>
          ) : undefined
        }
      >
        Contact
      </SectionHead>
      <div className="px-5 pb-4">
        {editContact ? (
          <div className="grid gap-3">
            <div>
              <FieldLabel htmlFor="sheet-phone">Phone</FieldLabel>
              <input id="sheet-phone" type="tel" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} className="ds-input" />
            </div>
            <div>
              <FieldLabel htmlFor="sheet-email">Email</FieldLabel>
              <input id="sheet-email" type="text" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className="ds-input" />
            </div>
            <div>
              <FieldLabel>Preferred</FieldLabel>
              <SegmentedTabs tabs={PREFERRED} value={preferred} onChange={setPreferred} size="sm" ariaLabel="Preferred contact" />
            </div>
            <div>
              <FieldLabel htmlFor="sheet-best">Best time to call</FieldLabel>
              <input id="sheet-best" value={bestTime} onChange={(e) => setBestTime(e.target.value)} placeholder="mornings before 10" maxLength={80} className="ds-input" />
            </div>
            <ErrorLine>{errFor("contact")}</ErrorLine>
            <div className="flex gap-2">
              <PrimaryButton size="md" disabled={busy === "contact"} onClick={() => void saveContact()}>
                {busy === "contact" ? "Saving…" : "Save"}
              </PrimaryButton>
              <GhostButton size="md" onClick={() => setEditContact(false)}>
                Cancel
              </GhostButton>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-[92px_1fr] gap-x-3 gap-y-1 font-condensed text-[13.5px]">
            <dt className="text-faint">Phone</dt>
            <dd className="text-ink">{agent.phone || <span className="text-faint">—</span>}</dd>
            <dt className="text-faint">Email</dt>
            <dd className="text-ink break-all">{agent.email || <span className="text-faint">—</span>}</dd>
            <dt className="text-faint">Prefers</dt>
            <dd className="text-ink">{prefers ?? <span className="text-faint">not asked yet</span>}</dd>
            <dt className="text-faint">Best time</dt>
            <dd className="text-ink">{agent.best_time_to_call || <span className="text-faint">—</span>}</dd>
          </dl>
        )}
      </div>

      {/* ---- tier — the owner's block ---- */}
      <SectionHead>Tier</SectionHead>
      <div className="px-5 pb-4">
        {isAdmin ? (
          <>
            <p className="font-condensed text-[13.5px] text-dim">
              Now <b className="text-ink">{bucketLabel(bucket)}</b>
              {suggestion && suggestion !== "parked" ? (
                <>
                  {" · "}dash suggests{" "}
                  <b className={suggestion === "below" ? "text-status-negative-text" : "text-ink"}>
                    {suggestion === "below" ? "no tier — losing money, consider parking" : suggestionLabel(suggestion)}
                  </b>
                </>
              ) : !loadsReady ? (
                <> · no suggestion — loads didn't come through</>
              ) : suggestion == null && established ? (
                <> · no suggestion — the rate ladder isn't ready</>
              ) : null}
            </p>
            <p className="font-condensed text-[12px] text-faint mt-0.5">{evidence}</p>
            <div className="mt-2.5">
              <SegmentedTabs tabs={TIER_TABS} value={pendingTier} onChange={setPendingTier} size="sm" ariaLabel="Tier" />
            </div>
            <div className="mt-2.5">
              <FieldLabel htmlFor="sheet-reason">Reason — required</FieldLabel>
              <input id="sheet-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="ds-input" />
            </div>
            <ErrorLine>{errFor("tier")}</ErrorLine>
            <PrimaryButton
              size="md"
              className="mt-3"
              disabled={busy === "tier" || pendingTier === currentPick || reason.trim().length === 0}
              title={pendingTier === currentPick ? "Pick a different tier to apply" : reason.trim().length === 0 ? "A tier change needs a reason" : undefined}
              onClick={() => void applyTier()}
            >
              {busy === "tier" ? "Applying…" : "Apply"}
            </PrimaryButton>
          </>
        ) : (
          <p className="flex items-center gap-2 font-condensed text-[13.5px] text-dim">
            <Lock size={13} className="text-faint" /> {bucketLabel(bucket)} — the owner sets tiers
          </p>
        )}
      </div>

      {/* ---- park / unpark ---- */}
      <SectionHead>{explicitlyParked ? "Parked" : dormant ? "Dormant" : "Park"}</SectionHead>
      <div className="px-5 pb-5">
        {explicitlyParked ? (
          <>
            {agent.park_reason && <p className="font-condensed text-[13px] text-dim mb-2 leading-snug">“{agent.park_reason}”</p>}
            <ErrorLine>{errFor("park")}</ErrorLine>
            <GhostButton size="lg" className="w-full" disabled={busy === "unpark"} onClick={() => void unpark()}>
              {busy === "unpark" ? "Unparking…" : unparkLabel}
            </GhostButton>
          </>
        ) : (
          <>
            {dormant && (
              <p className="font-condensed text-[13px] text-dim mb-2 leading-snug">
                dormant — a two-way contact brings them back
              </p>
            )}
            <textarea
              value={parkReason}
              onChange={(e) => setParkReason(e.target.value)}
              rows={2}
              placeholder={reasonRequired ? "Why — required (e.g. office personnel, not the freight decision-maker)" : "Why — optional for a spot agent"}
              className="w-full bg-well border border-hairline rounded-[8px] px-3 py-2 text-ink text-[13px] placeholder:text-faint resize-y"
            />
            <ErrorLine>{errFor("park")}</ErrorLine>
            <GhostButton
              size="lg"
              tone="danger"
              className="w-full mt-2"
              disabled={busy === "park" || (reasonRequired && parkReason.trim().length === 0)}
              title={reasonRequired && parkReason.trim().length === 0 ? "A written reason is required unless the agent is classed spot" : undefined}
              onClick={() => void park()}
            >
              {busy === "park" ? "Parking…" : "Park — leaves every list, keeps every record"}
            </GhostButton>
          </>
        )}
        <Link
          to={`/agents/${agent.agent_id}`}
          className="block text-center font-condensed font-semibold text-[12px] tracking-[.08em] uppercase text-amber-hi hover:text-hot mt-4"
        >
          Full profile →
        </Link>
      </div>
    </RelSheetShell>
  );
};
