import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { AlertLamp, StatusPill, type PillTone } from "@/components/ui/StatusPill";
import { Board, BoardCell } from "@/components/ui/Board";
import { Skeleton } from "@/components/ui/skeleton";
import { useRelationshipsData } from "@/hooks/useRelationshipsData";
import { isDispatcher } from "@/lib/roles";
import { SYSTEM_START } from "@/lib/metrics/relationships";
import { inboundHeadline } from "@/lib/relationships/inboundHeadline";
import { bucketLabel, bucketOf } from "@/lib/relationships/buckets";
import { keyOf, shortDate } from "@/lib/relationships/dayKeys";
import { loadGross } from "@/lib/metrics/rateTargets";
import { money, rpm as fmtRpm } from "@/lib/format";
import type { Load } from "@/types/load";
import {
  AGENCY_WINDOWS,
  WINDOW_LABEL,
  agencyRange,
  agencyRollup,
  codeTrail,
  deliveredInWindow,
  type AgencyAgentRow,
  type AgencyRow as AgencyRowModel,
  type AgencyWindow,
} from "@/lib/agencies/agencyMetrics";
import { otherCodes } from "@/lib/agencies/otherCodes";
import { AgentRow, type RowChip } from "@/components/relationships/AgentRow";
import { CodeChip, GhostButton, SectionHead } from "@/components/relationships/primitives";
import { AgencyForm } from "@/components/agencies/AgencyForm";

// /agencies/:agency_id — the one page for a desk. What it delivered, what it
// pays per mile against the live ladder, the people inside it with THEIR
// numbers and THEIR tiers untouched, what the settlements say about the codes
// its freight posted under, and the loads themselves.
//
// The dispatcher sees all of it and edits none of it: naming a new agency is
// hers (the list's + Agency, the call screen, the load form), correcting one
// that exists is the owner's.

const WINDOW_TABS = AGENCY_WINDOWS.map((w) => ({ value: w, label: WINDOW_LABEL[w] }));
const LOADS_FOLD = 8;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const TIER_TONE: Record<number, PillTone> = { 1: "good", 2: "info", 3: "neutral" };

// Where an agent's freight sits: the city they run out of most, else the city
// on their record. Only used for the row's md+ cell.
const placeOf = (a: AgencyAgentRow): string | null =>
  a.agent.agent_city ? `${a.agent.agent_city}${a.agent.agent_state ? `, ${a.agent.agent_state}` : ""}` : null;

// The one shared address the desk answers at — shown only when EVERY agent has
// an email and they all share the domain. One person with no address on file
// is missing evidence, not agreement: three agents at lstrcpl.com and a fourth
// nobody has an email for does not prove the desk answers at lstrcpl.com, and
// the header would be stating a fact nobody gave us.
const sharedDomain = (agents: AgencyAgentRow[]): string | null => {
  if (agents.length === 0) return null;
  const domains = new Set<string>();
  for (const a of agents) {
    const at = (a.agent.email ?? "").trim().toLowerCase().split("@")[1];
    if (!at) return null;
    domains.add(at);
  }
  return domains.size === 1 ? [...domains][0] : null;
};

// The mock's `.chip dim` — the quiet fact chip the header wears for the city
// and the shared email domain. Module level, never inside a render body.
const DimChip = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center h-[22px] px-2 rounded-[5px] font-condensed font-semibold text-[11px] tracking-[.06em] uppercase bg-dim/10 text-dim">
    {children}
  </span>
);

const placeOfAgency = (agents: AgencyAgentRow[]): string | null => {
  for (const a of agents) {
    const place = placeOf(a);
    if (place) return place;
  }
  return null;
};

const AgencyPage = () => {
  const { agency_id } = useParams<{ agency_id: string }>();
  const data = useRelationshipsData();
  const navigate = useNavigate();
  const isAdmin = !isDispatcher();
  // `range`, not `window` — a state variable by that name shadows the global
  // for the whole component. The resolved AgencyRange below is `bounds`.
  const [range, setRange] = useState<AgencyWindow>("12m");
  const [editing, setEditing] = useState(false);
  const [showAllLoads, setShowAllLoads] = useState(false);

  const rows = useMemo(
    () =>
      agencyRollup(
        data.agencies,
        data.agents,
        data.loads,
        data.contacts,
        data.ladder,
        range,
        data.now,
      ),
    [data.agencies, data.agents, data.loads, data.contacts, data.ladder, range, data.now],
  );

  const row: AgencyRowModel | null = useMemo(
    () => rows.find((r) => r.agency.agency_id === agency_id) ?? null,
    [rows, agency_id],
  );

  // Every load that was booked through this desk, newest pickup first —
  // the LOAD's agency, so history never follows a person to a new desk.
  const mine: Load[] = useMemo(
    () =>
      data.loads
        .filter((l) => l.agency_id === agency_id && l.load_status !== "cancelled")
        .sort((a, b) => (b.pickup_date ?? "").localeCompare(a.pickup_date ?? "")),
    [data.loads, agency_id],
  );

  const bounds = useMemo(() => agencyRange(range, data.now), [range, data.now]);
  // The LOADS board takes the window's FLOOR only, no ceiling: the window says
  // how far back to look, and freight already booked for next week is the most
  // relevant thing this desk has. (The delivered metrics keep both bounds —
  // a delivered load cannot have a future pickup anyway.)
  //
  // A load with NO pickup date yet is freight Brandie has booked and not
  // scheduled. `(null ?? "") >= fromKey` is false, so comparing the raw string
  // silently dropped it from both the board and the `booked` count — the one
  // state where the desk most needs to see it.
  const windowed = useMemo(
    () => mine.filter((l) => l.pickup_date == null || keyOf(l.pickup_date) >= bounds.fromKey),
    [mine, bounds],
  );
  const delivered = useMemo(() => deliveredInWindow(mine, bounds), [mine, bounds]);
  const trail = useMemo(() => codeTrail(row?.agency ?? null, delivered), [row, delivered]);

  // Freight on the board that hasn't run yet — booked, dispatched, in transit.
  const booked = windowed.filter((l) => l.load_status !== "delivered").length;
  const loading = data.loading || data.loadsLoading;
  const shown = showAllLoads ? windowed : windowed.slice(0, LOADS_FOLD);

  const agentChip = (a: AgencyAgentRow): RowChip => {
    if (a.tier != null) return { kind: "pill", tone: TIER_TONE[a.tier] ?? "neutral", label: `Tier ${a.tier}` };
    // No owner-set tier: say which non-tier state they are actually in rather
    // than leave the row unlabelled — the same derivation the book uses.
    const bucket = bucketOf(a.agent, {
      loads: data.loads,
      contacts: data.contacts,
      now: data.now,
      loadsReady: data.loadsReady,
    });
    return { kind: "pill", tone: bucket === "parked" ? "bad" : "neutral", label: bucketLabel(bucket) };
  };

  const agentContext = (a: AgencyAgentRow): string =>
    [
      `${a.delivered} delivered`,
      a.allInRpm == null ? null : `${fmtRpm(a.allInRpm)}${a.partialRpm ? "*" : ""} all-in`,
      a.lastContact ? `reached ${shortDate(a.lastContact)}` : "never reached",
    ]
      .filter((f): f is string => f != null)
      .join(" · ");

  const place = row ? placeOfAgency(row.agents) : null;
  const domain = row ? sharedDomain(row.agents) : null;
  // The agencies slice leads here: this page IS one agency, so a failed read
  // of that list is the reason the page is empty, and "No agency with that id"
  // would be a lie told about a book nobody managed to open.
  const bookError = data.errors.agencies ?? data.errors.contacts ?? data.errors.agents;

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-3 gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <Link
            to="/agencies"
            className="inline-flex items-center gap-1 font-condensed font-semibold text-[12px] tracking-[.08em] uppercase text-dim hover:text-ink"
          >
            <ChevronLeft size={15} /> Agencies
          </Link>
          <span className="flex-1" />
          {isAdmin && row && (
            <GhostButton size="sm" onClick={() => setEditing((v) => !v)}>
              {editing ? "Close" : "Edit"}
            </GhostButton>
          )}
        </div>

        {/* Both lamps sit ABOVE the ladder: a read that failed is why this
            page has nothing to draw, and hiding the explanation inside the
            branch that needs `row` is exactly the case where there is none. */}
        {bookError && (
          <AlertLamp category="book" className="mt-3">
            {bookError} —{" "}
            <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={() => void data.reload()}>
              retry
            </button>
          </AlertLamp>
        )}
        {data.loadsError && (
          <AlertLamp category="loads" className="mt-3">
            loads didn't come through — delivered, gross and RPM are incomplete ·{" "}
            <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={data.retryLoads}>
              retry
            </button>
          </AlertLamp>
        )}

        {loading ? (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-12" style={{ borderRadius: 10 }} />
            <Skeleton className="h-24" style={{ borderRadius: 12 }} />
            <Skeleton className="h-64" style={{ borderRadius: 12 }} />
          </div>
        ) : !row ? (
          // Only when the book actually came through: with the lamp lit above,
          // the missing agency is a symptom, not a verdict on the id.
          bookError ? null : (
            <p className="mt-6 font-condensed text-[14px] text-dim">
              No agency with that id.{" "}
              <Link to="/agencies" className="text-amber-hi hover:text-hot underline underline-offset-2">
                Back to the agencies
              </Link>
              .
            </p>
          )
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="font-display text-[26px] leading-none text-amber">
                {row.agency.name ?? row.agency.agency_code}
              </h1>
              <CodeChip code={row.agency.agency_code} kind="agency" />
              {otherCodes(row.agency).map((c) => (
                <CodeChip key={c} code={c} kind="posting" />
              ))}
              {place && <DimChip>{place}</DimChip>}
              {domain && <DimChip>{domain}</DimChip>}
            </div>

            {editing && (
              <AgencyForm
                agency={row.agency}
                onSaved={() => {
                  setEditing(false);
                  void data.reload();
                }}
                onCancel={() => setEditing(false)}
              />
            )}

            <SegmentedTabs
              tabs={WINDOW_TABS}
              value={range}
              onChange={setRange}
              size="sm"
              className="mt-3"
              ariaLabel="Window"
            />

            <Board className="grid grid-cols-1 sm:grid-cols-3 mt-3">
              <BoardCell
                className="border-b sm:border-b-0 sm:border-r ds2-cell-rule"
                label={`Delivered · ${WINDOW_LABEL[range]}`}
                value={String(row.delivered)}
                sub={
                  row.delivered > 0
                    ? `${money(row.gross)} gross${booked > 0 ? ` · ${booked} booked` : ""}`
                    : booked > 0
                      ? `${booked} booked, none delivered yet`
                      : "nothing in this window"
                }
              />
              <BoardCell
                className="border-b sm:border-b-0 sm:border-r ds2-cell-rule"
                label="All-in RPM"
                // No miles, or no ladder — an em dash, never a fake grade.
                value={row.allInRpm == null ? "—" : `${fmtRpm(row.allInRpm)}${row.partialRpm ? "*" : ""}`}
                sub={row.band ?? (row.allInRpm == null ? "no miles logged" : "no rate ladder yet")}
              />
              <BoardCell
                label="Inbound"
                value={inboundHeadline(row.inbound)}
                // "attributed since Sep 3" — the mock's words. The ISO date is
                // the constant; the caption is a sentence a person reads.
                sub={`attributed since ${shortDate(SYSTEM_START)}`}
              />
            </Board>

            <div className="ds2-board mt-3 overflow-hidden">
              <SectionHead right="their numbers, their tiers — unchanged">
                Agents · {row.agents.length}
              </SectionHead>
              {row.agents.length === 0 ? (
                <p className="px-3.5 pb-4 pt-1 font-condensed text-[13.5px] text-dim">
                  Nobody is filed under this agency yet — file an agent under the code and they show up here.
                </p>
              ) : (
                row.agents.map((a) => (
                  <AgentRow
                    key={a.agent.agent_id}
                    agent={a.agent}
                    chip={agentChip(a)}
                    context={agentContext(a)}
                    daysSince={data.loadsReady ? a.daysSinceContact : undefined}
                    market={placeOf(a)}
                    loadsCell={
                      a.delivered > 0 ? `${a.delivered} · ${a.allInRpm == null ? "—" : fmtRpm(a.allInRpm)}` : null
                    }
                    onOpen={() => navigate(`/agents/${a.agent.agent_id}`)}
                  />
                ))
              )}
            </div>

            <div className="ds2-board mt-3 overflow-hidden">
              <SectionHead right="settlements vs dash">Code trail</SectionHead>
              {delivered.length === 0 ? (
                <p className="px-3.5 pb-4 pt-1 font-condensed text-[13.5px] text-dim">
                  No delivered freight in this window — nothing for the settlements to disagree with.
                </p>
              ) : trail.unmatched.length === 0 ? (
                <p className="px-3.5 pb-4 pt-1 font-condensed text-[13.5px] text-dim">
                  {trail.matched} of {delivered.length} delivered loads post a code this agency owns. Nothing to
                  reconcile.
                  {trail.uncoded > 0 && ` ${plural(trail.uncoded, "load")} not on a settlement yet.`}
                </p>
              ) : (
                <>
                  {/* The three numbers have to add up to `delivered.length` or
                      the reader is left doing arithmetic that does not close:
                      "6 of 10 … · 1 under a code it does not · 3 not settled
                      yet". The uncoded loads are named in BOTH branches. */}
                  <p className="px-3.5 pb-2 pt-1 font-condensed text-[13.5px] text-dim">
                    {trail.matched} of {delivered.length} delivered loads post a code this agency owns
                    {trail.uncoded > 0 ? `, ${plural(trail.uncoded, "load")} not on a settlement yet` : ""}.{" "}
                    {plural(trail.unmatched.length, "load")} posted under a code it does not:
                  </p>
                  {trail.unmatched.map((u) => (
                    <Link
                      key={u.load.load_id}
                      to={`/loads/${u.load.load_id}`}
                      className="flex items-center gap-2.5 px-3.5 py-2.5 border-t border-hairline-lo hover:bg-white/[.02]"
                    >
                      <span className="font-condensed font-medium text-[14px] text-amber">{u.load.load_number}</span>
                      <span className="font-condensed text-[12px] text-dim">posted</span>
                      <CodeChip code={u.postingCode} kind="posting" />
                      <span className="ml-auto font-condensed text-[12px] text-faint">
                        {shortDate(u.load.pickup_date) ?? "—"}
                      </span>
                    </Link>
                  ))}
                </>
              )}
            </div>

            <div className="ds2-board mt-3 overflow-hidden">
              <SectionHead right={`${plural(windowed.length, "load")}`}>
                Loads · {WINDOW_LABEL[range]}
              </SectionHead>
              {windowed.length === 0 ? (
                <p className="px-3.5 pb-4 pt-1 font-condensed text-[13.5px] text-dim">
                  Nothing booked through this desk in this window.
                </p>
              ) : (
                <>
                  {shown.map((l) => (
                    <Link
                      key={l.load_id}
                      to={`/loads/${l.load_id}`}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-2.5 border-t border-hairline-lo hover:bg-white/[.02]"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 flex-wrap">
                          <span className="font-condensed font-medium text-[14px] text-amber">{l.load_number}</span>
                          {l.posting_code && <CodeChip code={l.posting_code} kind="posting" />}
                          {l.load_status !== "delivered" && (
                            <StatusPill tone="amber">{l.load_status.replace(/_/g, " ")}</StatusPill>
                          )}
                        </span>
                        <span className="block text-[11.5px] text-dim truncate mt-0.5">
                          {l.origin_city}, {l.origin_state} → {l.destination_city}, {l.destination_state} ·{" "}
                          {shortDate(l.pickup_date) ?? "—"}
                        </span>
                      </span>
                      <span className="font-condensed text-[13px] text-dim tabular-nums text-right">
                        {money(loadGross(l))}
                      </span>
                    </Link>
                  ))}
                  {windowed.length > LOADS_FOLD && (
                    <button
                      type="button"
                      onClick={() => setShowAllLoads((v) => !v)}
                      className="w-full text-left px-3.5 py-3 border-t border-hairline-lo font-condensed font-semibold text-[13px] text-amber-hi hover:text-hot"
                    >
                      {showAllLoads ? "show fewer" : `${windowed.length - LOADS_FOLD} more`}
                    </button>
                  )}
                </>
              )}
            </div>

            <p className="mt-3 font-condensed text-[11.5px] text-faint max-w-2xl leading-snug">
              This desk's numbers come off the loads booked THROUGH it, whoever works here now. The people's delivered
              counts and RPM are their own, over every load they have ever booked. * = a load with no deadhead logged
              counted loaded miles only.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default AgencyPage;
