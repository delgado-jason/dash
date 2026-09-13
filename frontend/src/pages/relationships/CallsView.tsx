import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Search, X } from "lucide-react";
import type { Agent } from "@/types/agent";
import type { AgentContact } from "@/services/agentContactsService";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { buildAgentScorecards, type AgentScorecard } from "@/lib/metrics/agentScorecard";
import { money } from "@/lib/format";
import { localDayKey, shortDate, weekdayShort } from "@/lib/relationships/dayKeys";
import { capStatus } from "@/lib/relationships/contactCap";
import { bucketLabel } from "@/lib/relationships/buckets";
import { contactTypeLabel } from "@/lib/relationships/contactTypes";
import { methodFor } from "@/lib/relationships/todayQueue";
import { capDoors } from "@/lib/relationships/touchOptions";
import { nameOf } from "@/lib/relationships/nameOf";
import { allHandled as everyHandled, nextUnhandled, rotationIds } from "@/lib/relationships/callOrder";
import {
  FOOTPRINT_QUESTIONS,
  GRADES,
  QUIET_DAYS,
  classLabel,
  gradeOf,
  holidayList,
  marketGrades,
  prospectsList,
  reactivationList,
  type HolidayRow,
  type MarketGrade,
  type ProspectRow,
  type ReactivationRow,
} from "@/lib/relationships/callList";
import { AgentRow, type RowChip, type RowRight } from "@/components/relationships/AgentRow";
import { CallScreen, type Working } from "@/components/relationships/CallScreen";
import type { TouchPrefill } from "@/components/relationships/LogTouchForm";
import { GhostButton, PrimaryButton, SectionHead } from "@/components/relationships/primitives";
import { useRelationships } from "./context";

// CALL LIST — /relationships/calls and /relationships/calls/:agentId. Two
// working lists on the v2 buckets (lib/relationships/callList): REACTIVATION —
// Prospects who hauled and went quiet, grouped by market grade, warmest
// first — and PROSPECTS — the ones who never ran. A row opens the call
// screen (a route, so a refresh mid-call lands back on the call): the right
// pane from md up, a full-screen sheet over the list on the phone.
//
// THE ADVANCE RULE — no index cursor. The screen keeps a session `handled`
// set (logged or skipped this sitting, kept in sessionStorage for the day);
// next = the first row of the CURRENT filtered list not in it, read AFTER
// the list has re-rendered with the reloaded book (a pending advance, never
// the closure the click was made in). A diverted call does not handle the
// dialed record — Brandie deals with that card herself. Handled rows stay
// listed, dimmed.
//
// THIS ROTATION (lib/relationships/callOrder) — the advance, "n of N", the
// tab count and "List worked" read the GRADED groups only. A row in the
// RECYCLE — NEXT ROTATION fold stays listed and tappable (its call screen
// reads "next rotation") but is never next and never counted.
//
// THE CAP, on every row (the nodded mock): an agent who already had a
// proactive touch this week wears "Touched {Day}" and sits dimmed like a
// handled row, so the cap is visible before the dial; the call screen then
// offers "Log anyway" with a reason — a call is never folded.
//
// THE HOLIDAY TAB — a third Working list, `Holiday · {Mon d}`, and only
// inside a holiday window (lib/relationships/holidays: Thanksgiving from ten
// days before through the day; New Year Dec 22 → Jan 2). It is not a call
// list: a holiday note is a written note, so a row opens the AGENT SHEET with
// the note prefilled — the same door Today's nurture rows use — and the tab
// takes no part in the advance rule, the rotation or "List worked". The cap
// shows on the row the same way it does on the call lists.

type MarketFilter = "all" | MarketGrade;
const MARKET_TABS: { value: MarketFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "C", label: "C" },
];

// One sitting's state, kept for the day so a refresh mid-call keeps its
// place — keyed by the signed-in user, so another login in the same browser
// never inherits the day's handled rows or filters.
const sessionKey = (): string => {
  let uid: string | null = null;
  try {
    uid = localStorage.getItem("user_id");
  } catch {
    // storage off — one anonymous sitting
  }
  return `dash.relationships.calls.session.${uid ?? "anon"}`;
};
// The Working switch: the two call lists, plus Holiday while a window is open.
type WorkingTab = Working | "holiday";

interface CallSession {
  day: string;
  working: WorkingTab;
  market: MarketFilter;
  handled: string[];
}
const readSession = (day: string): CallSession | null => {
  try {
    const raw = sessionStorage.getItem(sessionKey());
    if (!raw) return null;
    const s = JSON.parse(raw) as CallSession;
    return s.day === day ? s : null;
  } catch {
    return null;
  }
};
const writeSession = (s: CallSession) => {
  try {
    sessionStorage.setItem(sessionKey(), JSON.stringify(s));
  } catch {
    // private mode / storage off — the sitting just doesn't survive a refresh
  }
};

// What a row draws — built once per list row.
interface ViewRow {
  agent: Agent;
  grade: MarketGrade;
  chip: RowChip | null;
  context: string;
  daysSince: number | null;
  market: string | null;
  loadsCell: string | null;
  meter: number;
  why: string;
  recycle: boolean; // in the RECYCLE fold — listed, never next
  touched: string | null; // "Mon" — a proactive touch already went out this week (the cap)
}

const badChip: RowChip = { kind: "pill", tone: "bad", label: "bad #" };
const touchedChip = (day: string): RowChip => ({ kind: "pill", tone: "amber", label: `Touched ${day}` });

// The cap, once per row: the weekday of this week's proactive touch, or null.
const touchedDay = (agentId: string, contacts: AgentContact[], now: Date): string | null => {
  const cap = capStatus(agentId, contacts, now);
  return cap.blocked && cap.first ? weekdayShort(cap.first.contacted_at) : null;
};

const matches = (a: Agent, q: string) =>
  nameOf(a).toLowerCase().includes(q) ||
  `${a.posting_code ?? ""} ${a.agency_code ?? ""}`.toLowerCase().includes(q);
const keep = (r: ViewRow, market: MarketFilter, q: string) => (market === "all" || r.grade === market) && (!q || matches(r.agent, q));

// Line 1's one chip slot, in priority: BAD # (the last call bounced) →
// Touched {Day} (the cap) → the class — from the pin or the evidence, never a
// default; line 2 = "{topMarket} · {grade} · {n} loads · ${avg} avg".
const toReactivationRow = (r: ReactivationRow, scorecards: Map<string, AgentScorecard>, contacts: AgentContact[], now: Date): ViewRow => {
  const c = classLabel(r.agent, scorecards.get(r.agent.agent_id));
  const touched = touchedDay(r.agent.agent_id, contacts, now);
  const market = r.topMarket ? `${r.topMarket.city}, ${r.topMarket.state}` : null;
  return {
    agent: r.agent,
    grade: r.grade,
    chip: r.badNumber ? badChip : touched ? touchedChip(touched) : { kind: "pill", tone: c.label === "Direct" ? "good" : "neutral", label: c.label },
    context: [market, r.grade, `${r.delivered} load${r.delivered === 1 ? "" : "s"}`, `${money(r.avgGross)} avg`].filter((s): s is string => s != null).join(" · "),
    daysSince: r.daysQuiet,
    market,
    loadsCell: `${r.delivered} · ${money(r.avgGross)}`,
    meter: r.footprintScore,
    why: r.why,
    recycle: r.recycle,
    touched,
  };
};

// Prospects wear their stage (same slot, same priority); line 2 = "{city, ST}
// · via {source} · {stage}".
const toProspectRow = (r: ProspectRow, contacts: AgentContact[], now: Date): ViewRow => {
  const touched = touchedDay(r.agent.agent_id, contacts, now);
  return {
    agent: r.agent,
    grade: r.grade,
    chip: r.badNumber ? badChip : touched ? touchedChip(touched) : { kind: "pill", tone: r.stage === "replied" ? "info" : "neutral", label: r.stageLabel },
    context: [r.place ?? "no city yet", r.sourceLabel ? `via ${r.sourceLabel}` : null, r.stageLabel].filter((s): s is string => s != null).join(" · "),
    daysSince: r.daysQuiet,
    market: r.place,
    loadsCell: null,
    meter: r.footprintScore,
    why: r.why,
    recycle: false,
    touched,
  };
};

// A HOLIDAY row. Line 1 wears the cap chip when this week's proactive touch
// already went out, otherwise the shelf the agent sits on; line 2 says what is
// owed, or what the note would fold into. The row's door is the agent sheet,
// with the note prefilled exactly as Today's nurture rows prefill it — type
// `holiday`, the holiday-year marker leading the note so the flag stays down
// once it is logged — and the sheet's own form decides the cap's doors.
interface HolidayViewRow {
  agent: Agent;
  chip: RowChip | null;
  context: string;
  right: RowRight;
  touched: boolean;
  prefill: TouchPrefill;
}

const toHolidayRow = (r: HolidayRow, label: string): HolidayViewRow => {
  const first = r.cap.blocked ? r.cap.first : null;
  const day = first ? weekdayShort(first.contacted_at) : null;
  const shelf = bucketLabel(r.bucket);
  // The channel decides the cap's door, so the line promises what the sheet
  // will actually offer: a message folds, a call never does.
  const method = methodFor(r.agent.preferred_contact);
  return {
    agent: r.agent,
    chip: day ? touchedChip(day) : { kind: "pill", tone: "neutral", label: shelf },
    context:
      day && first
        ? `${shelf} · ${contactTypeLabel(first.type)} went out ${day} — ${capDoors(method).fold ? "fold this one into it" : "log it anyway, with a reason"}`
        : `${shelf} · ${label} note not sent yet`,
    right: day ? { value: day, caption: "touched" } : { value: "clear", caption: "this week" },
    touched: day != null,
    prefill: { direction: "outbound", method, type: "holiday", note: `${r.marker} ` },
  };
};

const HolidayRows = ({ rows, onOpen }: { rows: HolidayViewRow[]; onOpen: (r: HolidayViewRow) => void }) => (
  <>
    {rows.map((r) => (
      <AgentRow
        key={r.agent.agent_id}
        agent={r.agent}
        chip={r.chip}
        context={r.context}
        daysSince={undefined}
        right={r.right}
        dimmed={r.touched}
        onOpen={() => onOpen(r)}
      />
    ))}
  </>
);

const Rows = ({ rows, handled, dimmed, onOpen }: { rows: ViewRow[]; handled: Set<string>; dimmed?: boolean; onOpen: (id: string) => void }) => (
  <>
    {rows.map((r) => (
      <AgentRow
        key={r.agent.agent_id}
        agent={r.agent}
        chip={r.chip}
        context={r.context}
        daysSince={r.daysSince}
        daysCaption="quiet"
        neverCaption="touched"
        market={r.market}
        loadsCell={r.loadsCell}
        meter={{ on: r.meter, cells: FOOTPRINT_QUESTIONS }}
        dimmed={dimmed || handled.has(r.agent.agent_id) || r.touched != null}
        onOpen={() => onOpen(r.agent.agent_id)}
      />
    ))}
  </>
);

const Caption = ({ children }: { children: string }) => (
  <span className="block text-[11px] uppercase tracking-widest text-faint font-condensed mb-1">{children}</span>
);

const CallsView = () => {
  const { agents, agencies, loads, contacts, coverage, notes, now, loadsReady, openAgent, openProspect, notify, reload } = useRelationships();
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const today = localDayKey(now);

  const [workingPick, setWorking] = useState<WorkingTab>(() => readSession(localDayKey(new Date()))?.working ?? "reactivation");
  const [market, setMarket] = useState<MarketFilter>(() => readSession(localDayKey(new Date()))?.market ?? "all");
  const [handled, setHandled] = useState<Set<string>>(() => new Set(readSession(localDayKey(new Date()))?.handled ?? []));
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showRecycle, setShowRecycle] = useState(false);
  // Bumped after a diverted log so the form resets while the route stays.
  const [formKey, setFormKey] = useState(0);
  // THE ADVANCE, pending: bumped when a row is handled; the effect below
  // navigates once per bump, after the list has rendered with it.
  const [advance, setAdvance] = useState(0);
  const advanced = useRef(0);

  // ---- the lists ----
  const grades = useMemo(() => marketGrades(loads, now), [loads, now]);
  const scorecards = useMemo(() => buildAgentScorecards(agents, loads, now), [agents, loads, now]);
  const reactivation = useMemo(
    () => reactivationList(agents, loads, contacts, coverage, now, grades, loadsReady),
    [agents, loads, contacts, coverage, now, grades, loadsReady],
  );
  const prospects = useMemo(
    () => prospectsList(agents, loads, contacts, now, coverage, grades, loadsReady),
    [agents, loads, contacts, now, coverage, grades, loadsReady],
  );
  const holiday = useMemo(
    () => holidayList(agents, contacts, notes, now, { loads, contacts, now, loadsReady }),
    [agents, contacts, notes, now, loads, loadsReady],
  );

  // The Holiday tab exists only inside its window: a sitting that picked it
  // yesterday falls back to the reactivation list once the window closes,
  // rather than leaving the switch pointing at a tab that isn't there.
  const working: WorkingTab = workingPick === "holiday" && !holiday.window ? "reactivation" : workingPick;
  const holidayTab = working === "holiday";
  // The call screen only ever works the two call lists; a Holiday sitting with
  // a call still on the route (a hand-typed URL) reads as reactivation.
  const callWorking: Working = working === "prospects" ? "prospects" : "reactivation";

  useEffect(() => {
    writeSession({ day: today, working, market, handled: [...handled] });
  }, [today, working, market, handled]);

  const q = query.trim().toLowerCase();
  const filtering = market !== "all" || q.length > 0;

  // Display order — the grade groups, then the recycle fold; or the prospects.
  const groups = useMemo(
    () =>
      working === "reactivation"
        ? GRADES.map((g) => ({
            grade: g,
            rows: reactivation.groups[g].map((r) => toReactivationRow(r, scorecards, contacts, now)).filter((r) => keep(r, market, q)),
          }))
        : [],
    [working, reactivation, scorecards, contacts, now, market, q],
  );
  const recycleRows = useMemo(
    () => (working === "reactivation" ? reactivation.recycle.map((r) => toReactivationRow(r, scorecards, contacts, now)).filter((r) => keep(r, market, q)) : []),
    [working, reactivation, scorecards, contacts, now, market, q],
  );
  const prospectRows = useMemo(
    () => (working === "prospects" ? prospects.rows.map((r) => toProspectRow(r, contacts, now)).filter((r) => keep(r, market, q)) : []),
    [working, prospects, contacts, now, market, q],
  );
  // Holiday rows take the search, never the market grade — the list is the
  // whole active book, and a holiday note has no market to rank by.
  const holidayRows = useMemo(() => {
    const label = holiday.label;
    if (!holidayTab || !label) return [];
    return holiday.rows.map((r) => toHolidayRow(r, label)).filter((r) => !q || matches(r.agent, q));
  }, [holidayTab, holiday, q]);
  // Everything drawn — the graded groups, then the fold (a recycle row stays
  // tappable); or the prospects.
  const displayRows: ViewRow[] = working === "reactivation" ? [...groups.flatMap((g) => g.rows), ...recycleRows] : prospectRows;
  // THIS ROTATION — the graded rows only: what the advance walks, what
  // "n of N" and "List worked" count. Never the fold.
  const orderedIds = rotationIds(displayRows);
  const listWorked = everyHandled(orderedIds, handled);
  const nextUp = nextUnhandled(orderedIds, handled); // the first row of the CURRENT list not handled

  // ---- the call ----
  const callAgent = agentId ? agents.find((a) => a.agent_id === agentId) ?? null : null;
  const callRow = agentId ? displayRows.find((r) => r.agent.agent_id === agentId) ?? null : null;
  const callIndex = agentId ? orderedIds.indexOf(agentId) : -1;
  const firstCallOfDay = !contacts.some((c) => c.direction === "outbound" && c.method === "call" && localDayKey(new Date(c.contacted_at)) === today);

  const goTo = (id: string | null) => navigate(id ? `/relationships/calls/${id}` : "/relationships/calls");
  // THE ADVANCE RULE in two steps, so "next" is never read from a stale
  // closure: mark the row handled (state), then navigate from the effect once
  // the list — reloaded after a log — has rendered with it.
  const advanceFrom = (id: string) => {
    setHandled((cur) => new Set(cur).add(id));
    setAdvance((n) => n + 1);
  };
  useEffect(() => {
    if (advance === advanced.current) return;
    advanced.current = advance; // each bump navigates exactly once
    navigate(nextUp ? `/relationships/calls/${nextUp}` : "/relationships/calls");
  }, [advance, nextUp, navigate]);
  const onLogged = (dialedId: string, diverted: boolean) => {
    if (diverted) setFormKey((k) => k + 1); // the dialed record stays on screen — skip or park it yourself
    else advanceFrom(dialedId);
  };
  const startAtTop = () => goTo(nextUp);
  const switchToProspects = () => {
    setWorking("prospects");
    goTo(null);
  };

  // The tab counts count THIS rotation — and read "—" until the loads are in,
  // because no count is honest without them. The Holiday tab carries the
  // holiday's own DATE instead of a count ("Holiday · Nov 26"), and appears
  // only while its window is open.
  const count = (n: number) => (loadsReady ? String(n) : "—");
  const workingTabs: { value: WorkingTab; label: string }[] = [
    { value: "reactivation", label: `Reactivation · ${count(reactivation.rotation.length)}` },
    { value: "prospects", label: `Prospects · ${count(prospects.rows.length)}` },
    ...(holiday.window ? [{ value: "holiday" as const, label: `Holiday · ${shortDate(holiday.window.day)}` }] : []),
  ];
  const nextName = (() => {
    const a = nextUp ? agents.find((x) => x.agent_id === nextUp) : null;
    return a ? nameOf(a) : null;
  })();

  const completion =
    working === "reactivation" ? (
      <EmptyState
        title="List worked — every lapsed prospect has been called."
        hint={
          <button type="button" onClick={switchToProspects} className="text-amber-hi hover:text-hot font-condensed">
            Prospects are next →
          </button>
        }
      />
    ) : (
      <EmptyState title="List worked — every prospect has been called." hint="new prospects join as you add them" />
    );

  const gradeHead = (g: MarketGrade, n: number) => (g === "A" ? `A · priority markets · ${n}` : `${g} · ${n}`);

  return (
    <div className="mt-4 md:grid md:grid-cols-[1fr_1.2fr] md:gap-4 md:items-start">
      {/* ---- the list ---- */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <div>
            <Caption>Working</Caption>
            <SegmentedTabs
              tabs={workingTabs}
              value={working}
              onChange={(w) => {
                setWorking(w);
                goTo(null);
              }}
              size="sm"
              ariaLabel="Working list"
            />
          </div>
          {/* Market grades rank a CALL list; the holiday list is the whole
              active book, so the filter stays out of that tab rather than
              sitting there doing nothing. */}
          {!holidayTab && (
            <div>
              <Caption>Market</Caption>
              <SegmentedTabs tabs={MARKET_TABS} value={market} onChange={setMarket} size="sm" ariaLabel="Market grade" />
            </div>
          )}
          <button
            type="button"
            aria-label={searchOpen ? "Close search" : "Search the list"}
            aria-pressed={searchOpen}
            onClick={() => {
              setSearchOpen((v) => !v);
              if (searchOpen) setQuery("");
            }}
            className={`w-11 h-11 rounded-[10px] border grid place-items-center ${searchOpen ? "border-amber text-amber-hi" : "border-hairline text-dim hover:text-ink"}`}
          >
            {searchOpen ? <X size={17} /> : <Search size={17} />}
          </button>
          {searchOpen && (
            <div className="relative flex-1 min-w-[200px] max-w-[360px]">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="name or code"
                aria-label="Search the call list"
                className="ds-input"
              />
            </div>
          )}
        </div>
        <p className="mt-2 font-condensed text-[11.5px] text-faint leading-snug">
          {holidayTab
            ? `the active book — tiers and prospects; parked and dormant sit this one out · one ${holiday.label ?? "holiday"} note each, sent or skipped, and it never comes back`
            : grades.caption}
        </p>

        {!loadsReady ? (
          <p className="mt-4 font-condensed text-[13px] text-dim">loads didn't come through — the call list is built from them; retry above.</p>
        ) : (
          <>
            {listWorked && !agentId && <div className="md:hidden">{completion}</div>}
            <div className="ds2-board overflow-hidden mt-3">
              {holidayTab ? (
                <>
                  <SectionHead>
                    Holiday · {holiday.label} · {holidayRows.length} left
                  </SectionHead>
                  {holiday.rows.length === 0 ? (
                    <EmptyState title={`Everyone's been wished — ${holiday.label} notes are all out.`} hint="sent or skipped, each one stays down until next year" />
                  ) : holidayRows.length === 0 ? (
                    <p className="px-3.5 py-4 font-condensed text-[13.5px] text-dim">nothing matches “{query.trim()}”</p>
                  ) : (
                    <HolidayRows rows={holidayRows} onOpen={(r) => openAgent(r.agent.agent_id, { prefill: r.prefill })} />
                  )}
                </>
              ) : working === "reactivation" ? (
                <>
                  {reactivation.all.length === 0 && !filtering ? (
                    <EmptyState
                      title="Nobody lapsed — every prospect who hauled has been reached in the last six weeks."
                      hint={
                        <button type="button" onClick={switchToProspects} className="text-amber-hi hover:text-hot font-condensed">
                          Prospects are next →
                        </button>
                      }
                    />
                  ) : displayRows.length === 0 ? (
                    <p className="px-3.5 py-4 font-condensed text-[13.5px] text-dim">
                      nothing matches {market !== "all" ? `market ${market}` : ""}
                      {market !== "all" && q ? " and " : ""}
                      {q ? `“${query.trim()}”` : ""}
                    </p>
                  ) : (
                    <>
                      {groups.map(
                        (g) =>
                          g.rows.length > 0 && (
                            <div key={g.grade}>
                              <SectionHead>{gradeHead(g.grade, g.rows.length)}</SectionHead>
                              <Rows rows={g.rows} handled={handled} onOpen={goTo} />
                            </div>
                          ),
                      )}
                      {recycleRows.length > 0 && (
                        <div className="opacity-70">
                          <SectionHead
                            right={
                              <button type="button" onClick={() => setShowRecycle((v) => !v)} className="hover:text-hot">
                                {showRecycle ? "hide" : "show"}
                              </button>
                            }
                          >
                            Recycle — next rotation · {recycleRows.length} · three unreached calls in two weeks
                          </SectionHead>
                          <p className="px-3.5 pb-3 font-condensed text-[13px] text-dim leading-snug">
                            Persistence is a channel problem, not a frequency problem — find the number or the time they answer. They re-enter
                            on their own after {QUIET_DAYS} quiet days.
                          </p>
                          {showRecycle && <Rows rows={recycleRows} handled={handled} dimmed onOpen={goTo} />}
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  <SectionHead>{prospects.head}</SectionHead>
                  {prospects.rows.length === 0 && !filtering ? (
                    <EmptyState
                      title="No prospects yet — + Prospect above"
                      hint={
                        <button type="button" onClick={openProspect} className="text-amber-hi hover:text-hot font-condensed">
                          + Prospect
                        </button>
                      }
                    />
                  ) : displayRows.length === 0 ? (
                    <p className="px-3.5 py-4 font-condensed text-[13.5px] text-dim">nothing matches</p>
                  ) : (
                    <Rows rows={prospectRows} handled={handled} onOpen={goTo} />
                  )}
                </>
              )}
            </div>
            {holidayTab ? (
              <p className="mt-3 font-condensed text-[11.5px] text-faint max-w-xl leading-snug">
                One {holiday.label} note per agent, by hand — tap a row and the note opens on their sheet, drafted in their name and yours, to
                copy and send. Logging it, or skipping it, takes them off this list for good this year. A dimmed row with a Touched chip already
                had this week's proactive touch: a note that goes out as a message folds into it, one that goes out as a call logs on its own
                with a reason. Tier 1 is first — those are the ones the owner personalizes.
              </p>
            ) : (
              <p className="mt-3 font-condensed text-[11.5px] text-faint max-w-xl leading-snug">
                Reactivation is warm — prospects who hauled and went {QUIET_DAYS} days without a two-way contact or a load; a promised callback
                keeps them off the list until it's due. Tap a row to call; Log & next moves down the list, Skip does too. A dimmed row with a
                Touched chip already had this week's proactive touch.
              </p>
            )}
          </>
        )}
      </div>

      {/* ---- the call — the right pane from md up, a full-screen sheet on the phone ---- */}
      <div className="min-w-0">
        {callAgent ? (
          <div className="md:rounded-[12px] md:border md:border-hairline md:bg-panel md:overflow-hidden">
            <CallScreen
              key={`${callAgent.agent_id}:${formKey}`}
              agent={callAgent}
              agents={agents}
              agencies={agencies}
              loads={loads}
              contacts={contacts}
              coverage={coverage}
              scorecard={scorecards.get(callAgent.agent_id)}
              now={now}
              working={callWorking}
              grade={callRow?.grade ?? gradeOf(grades, callAgent.agent_state)}
              why={callRow?.why ?? null}
              position={callIndex >= 0 ? { index: callIndex, total: orderedIds.length } : null}
              recycled={callRow?.recycle === true}
              firstCallOfDay={firstCallOfDay}
              onBack={() => goTo(null)}
              onSkip={() => advanceFrom(callAgent.agent_id)}
              onLogged={onLogged}
              reload={reload}
              notify={notify}
            />
          </div>
        ) : agentId ? (
          <div className="ds2-board">
            <EmptyState
              title="That agent isn't in the book"
              hint={
                <GhostButton size="md" onClick={() => goTo(null)}>
                  Back to the list
                </GhostButton>
              }
            />
          </div>
        ) : (
          <div className="hidden md:block ds2-board">
            {holidayTab ? (
              <EmptyState
                title={`${holiday.label} notes — tap a row`}
                hint="the note opens on the agent's sheet, drafted and ready to copy — there is no call screen for this one"
              />
            ) : listWorked ? (
              completion
            ) : (
              <EmptyState
                title={nextName ? `Next up — ${nextName}` : "Tap a row to start the call"}
                hint={
                  nextName ? (
                    <PrimaryButton size="md" className="mt-1" onClick={startAtTop}>
                      Start at the top →
                    </PrimaryButton>
                  ) : (
                    "the list on the left is the order — warmest first"
                  )
                }
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CallsView;
