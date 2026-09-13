import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, ChevronDown, ChevronRight, Copy, Search } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { AlertLamp, StatusPill } from "@/components/ui/StatusPill";
import { Skeleton } from "@/components/ui/skeleton";
import { useRelationshipsData } from "@/hooks/useRelationshipsData";
import { useSettlementOnly } from "@/hooks/useSettlementOnly";
import { SYSTEM_START, inboundShare } from "@/lib/metrics/relationships";
import { inboundHeadline } from "@/lib/relationships/inboundHeadline";
import { shortDate, utcDayKey } from "@/lib/relationships/dayKeys";
import { nameOf } from "@/lib/relationships/nameOf";
import { money, rpm as fmtRpm } from "@/lib/format";
import { copyText } from "@/lib/clipboard";
import {
  AGENCY_WINDOWS,
  WINDOW_LABEL,
  agencyReport,
  agencyRollup,
  settlementOnlyShelf,
  type AgencyRow as AgencyRowModel,
  type AgencyWindow,
  type ShelfRow,
} from "@/lib/agencies/agencyMetrics";
import { CodeChip, PrimaryButton, GhostButton } from "@/components/relationships/primitives";
import { AgencyRow, AgencyRowHeader, RowCell } from "@/components/agencies/AgencyRow";
import { AgencyForm } from "@/components/agencies/AgencyForm";

// /agencies — the book rolled up by agency (Agencies Nod Sheet, decision 7A).
// One row per desk: what it delivered, what it paid per mile against the live
// ladder, who works there and how many of them the owner has tiered. The
// people keep their own numbers and tiers on their own pages — this page never
// re-grades anybody.
//
// It reads the Relationships data hook rather than a second one of its own: the
// rollup needs agents, loads, contacts, the agencies and the ladder, which is
// exactly that hook's book, and a parallel fetcher would be one more place for
// "what counts as delivered" to drift.

const WINDOW_TABS = AGENCY_WINDOWS.map((w) => ({ value: w, label: WINDOW_LABEL[w] }));

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const tierWord = (tier: number | null): string => (tier == null ? "" : ` T${tier}`);

// Line 2 of a row: who works this desk, each with their tier word, then when
// the agency last had freight. Three names is plenty — the agency page lists
// them all.
//
// Freight already on the board reads forward, not backward: a pickup still
// ahead of today is "picks up Sep 14" (the mock's CPL row), never "last load
// Sep 14" for a load that has not moved yet.
const agencyContext = (row: AgencyRowModel): string => {
  const names = row.agents.map((a) => `${nameOf(a.agent)}${tierWord(a.tier)}`);
  const facts: string[] = [];
  if (names.length > 3) facts.push(`${names.slice(0, 3).join(" · ")} +${names.length - 3}`);
  else if (names.length > 0) facts.push(names.join(" · "));
  else facts.push("nobody filed here yet");
  const last = shortDate(row.lastLoad);
  if (last) facts.push(row.daysUntilLoad != null ? `picks up ${last}` : `last load ${last}`);
  return facts.join(" · ");
};

// The dashed chips on a list row are the codes the PEOPLE post under — the
// agency's own code is already lit beside the name. (The agency's page shows
// the full posting_codes set, older desks included.)
const agentCodes = (row: AgencyRowModel): string[] => {
  const seen = new Set<string>();
  for (const a of row.agents) if (a.postingCode?.kind === "posting") seen.add(a.postingCode.code);
  return [...seen].sort();
};

const matches = (row: AgencyRowModel, q: string): boolean =>
  (row.agency.name ?? "").toLowerCase().includes(q) ||
  row.agency.agency_code.toLowerCase().includes(q) ||
  (row.agency.posting_codes ?? []).some((c) => c.toLowerCase().includes(q)) ||
  row.agents.some((a) => nameOf(a.agent).toLowerCase().includes(q));

const ListSkeleton = () => (
  <div className="mt-4 space-y-3">
    <Skeleton className="h-11" style={{ borderRadius: 10 }} />
    <Skeleton className="h-64" style={{ borderRadius: 12 }} />
  </div>
);

const AgenciesPage = () => {
  const data = useRelationshipsData();
  const shelfSlice = useSettlementOnly();
  const navigate = useNavigate();
  // `range`, not `window`: a state variable called `window` shadows the global
  // one for the whole component, and every setTimeout inside it then has to be
  // spelled globalThis.setTimeout to reach the real thing.
  const [range, setRange] = useState<AgencyWindow>("12m");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [adding, setAdding] = useState<{ code: string } | null>(null);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [showQuiet, setShowQuiet] = useState(false);
  const [copied, setCopied] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  // The form opens at the top of the page, but the `+` that opens it prefilled
  // is on a shelf row at the bottom — without this, that tap looks like it did
  // nothing at all.
  useEffect(() => {
    if (adding) formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [adding]);

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

  const shelf: ShelfRow[] = useMemo(
    () => settlementOnlyShelf(shelfSlice.rows, data.agencies),
    [shelfSlice.rows, data.agencies],
  );

  // The same fraction the Relationships shell shows — inbound since the day
  // the system went live, account-wide.
  const headline = useMemo(
    () => inboundHeadline(inboundShare(data.loads, SYSTEM_START, utcDayKey(data.now))),
    [data.loads, data.now],
  );

  const q = query.trim().toLowerCase();
  const found = q ? rows.filter((r) => matches(r, q)) : rows;
  // Desks that ran in this window lead; the quiet ones fold, so a book of
  // forty agencies doesn't bury the five that are working.
  const ran = found.filter((r) => r.delivered > 0);
  const quiet = found.filter((r) => r.delivered === 0);
  const quietShown = q || showQuiet ? quiet : [];
  const shelfLoads = shelf.reduce((n, s) => n + s.loads, 0);
  const shelfYear = shelfSlice.since ? shelfSlice.since.slice(0, 4) : null;
  const loading = data.loading || data.loadsLoading;
  // One lamp for the book's three slices, in the Relationships layout's order
  // — the agents are the book, the contact log dates it, the agencies name the
  // desks. Any of the three missing makes every row on this page incomplete.
  const bookError = data.errors.agents ?? data.errors.contacts ?? data.errors.agencies;

  // The report is what is ON SCREEN: the rows the search left standing, in the
  // order they are drawn. Copying the whole book while the page shows five
  // matches hands the reader a different document than the one they are
  // looking at.
  const copy = () => {
    copyText(agencyReport(found, shelf, WINDOW_LABEL[range], shelfSlice.since, data.now));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const onSaved = () => {
    setAdding(null);
    void data.reload();
    void shelfSlice.reload();
  };

  const listRow = (row: AgencyRowModel) => (
    <AgencyRow
      key={row.agency.agency_id}
      name={row.agency.name ?? row.agency.agency_code}
      to={`/agencies/${row.agency.agency_id}`}
      chips={
        <>
          <CodeChip code={row.agency.agency_code} kind="agency" />
          {agentCodes(row).map((c) => (
            <CodeChip key={c} code={c} kind="posting" />
          ))}
        </>
      }
      context={agencyContext(row)}
      cells={[
        <RowCell
          key="delivered"
          value={
            <>
              <b className="text-ink">{row.delivered}</b> · {row.delivered > 0 ? money(row.gross) : "—"}
            </>
          }
        />,
        <RowCell
          key="rpm"
          value={<b className="text-ink">{row.allInRpm == null ? "—" : `${fmtRpm(row.allInRpm)}${row.partialRpm ? "*" : ""}`}</b>}
          sub={row.band}
        />,
        <RowCell
          key="agents"
          value={<b className="text-ink">{row.agents.length}</b>}
          sub={
            row.agents.length === 0
              ? "nobody filed"
              : row.tieredCount > 0
                ? `${row.tieredCount} tiered`
                : "prospect"
          }
        />,
      ]}
      right={{
        // Freight not picked up yet counts DOWN to the pickup; everything else
        // counts up from the last one. No loads at all is an em dash under the
        // same word — "no loads" as a caption over "—" says it twice.
        value:
          row.daysUntilLoad != null
            ? `${row.daysUntilLoad}d`
            : row.daysSinceLoad == null
              ? "—"
              : `${row.daysSinceLoad}d`,
        caption: row.daysUntilLoad != null ? "until pickup" : "since load",
      }}
      onOpen={() => navigate(`/agencies/${row.agency.agency_id}`)}
      openLabel={`Open ${row.agency.name ?? row.agency.agency_code}`}
    />
  );

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        {/* statusbar — the house pattern */}
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">AGENCIES</h1>
          <span className="font-condensed font-medium text-[15px] text-dim min-w-0 truncate max-w-full">
            rolled up by agency — agents keep their own numbers
          </span>
          <span className="flex-1" />
          <Link
            to="/relationships/review"
            title={`inbound share of attributed loads since ${SYSTEM_START}`}
            className="inline-flex items-center gap-2 h-[30px] px-3 rounded-full font-condensed font-semibold text-[13px] bg-gradient-to-b from-plate-a to-plate-lo border-t border-white/10 shadow hover:text-hot"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber" style={{ boxShadow: "0 0 7px rgba(232,148,10,.9)" }} />
            INBOUND {data.loadsLoading ? "…" : data.loadsError ? "—" : headline}
          </Link>
          <PrimaryButton size="md" onClick={() => setAdding({ code: "" })}>
            <Building2 size={15} /> + Agency
          </PrimaryButton>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-3">
          <SegmentedTabs
            tabs={WINDOW_TABS}
            value={range}
            onChange={setRange}
            size="sm"
            ariaLabel="Window"
          />
          {searchOpen ? (
            <div className="relative flex-1 min-w-[200px] max-w-[340px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="name, code or agent"
                aria-label="Search the agencies"
                className="ds-input pl-9"
              />
            </div>
          ) : (
            <button
              type="button"
              aria-label="Search the agencies"
              onClick={() => setSearchOpen(true)}
              className="w-9 h-9 rounded-[9px] border border-hairline grid place-items-center text-dim hover:text-ink"
            >
              <Search size={16} />
            </button>
          )}
          <span className="flex-1" />
          <GhostButton size="sm" onClick={copy}>
            <Copy size={14} /> {copied ? "Copied" : "Copy report"}
          </GhostButton>
        </div>

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
        {shelfSlice.error && (
          <AlertLamp category="settlements" className="mt-3">
            {shelfSlice.error} — the shelf below may be short ·{" "}
            <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={() => void shelfSlice.reload()}>
              retry
            </button>
          </AlertLamp>
        )}

        <div ref={formRef}>
          {adding && (
            // Keyed on the code: tapping a second shelf row's + while the form
            // is open has to refill it, not leave the first code sitting there.
            <AgencyForm
              key={adding.code}
              prefillCode={adding.code}
              onSaved={onSaved}
              onCancel={() => setAdding(null)}
            />
          )}
        </div>

        {loading ? (
          <ListSkeleton />
        ) : (
          <>
            <div className="ds2-board mt-3 overflow-hidden">
              <AgencyRowHeader cols={["agency", "delivered · gross", "all-in rpm", "agents", "since load"]} />
              {rows.length === 0 ? (
                <p className="px-3.5 py-4 font-condensed text-[13.5px] text-dim">
                  No agencies yet — one is created the first time an agent is filed under a code.
                </p>
              ) : found.length === 0 ? (
                <p className="px-3.5 py-4 font-condensed text-[13.5px] text-dim">
                  Nothing matches “{query.trim()}”.
                </p>
              ) : (
                <>
                  {ran.map(listRow)}
                  {quietShown.map(listRow)}
                  {!q && quiet.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowQuiet((v) => !v)}
                      className="w-full text-left px-3.5 py-3 border-t border-hairline-lo font-condensed font-semibold text-[13px] text-amber-hi hover:text-hot"
                    >
                      {showQuiet ? "show fewer" : `${quiet.length} more · nothing delivered in this window`}
                    </button>
                  )}
                </>
              )}
            </div>

            {/* The settlement-only shelf (decision 8, amended) — folded by default. */}
            <div className="ds2-board mt-3 overflow-hidden">
              <button
                type="button"
                onClick={() => setShelfOpen((v) => !v)}
                aria-expanded={shelfOpen}
                className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left font-condensed font-semibold text-[11px] tracking-[.14em] uppercase text-faint hover:text-ink"
              >
                {shelfOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                <span>
                  SETTLEMENT-ONLY{shelfYear ? ` · ${shelfYear}` : ""}
                  {/* A count nobody could read is not a count: the head says
                      nothing at all rather than "0 codes, 0 loads" when the
                      settlements didn't come through. */}
                  {shelfSlice.error
                    ? ""
                    : shelfSlice.isLoading
                      ? " · …"
                      : ` · ${plural(shelf.length, "code")} · ${plural(shelfLoads, "load")}`}
                </span>
                <span className="ml-auto normal-case tracking-[.06em] text-[11.5px] text-amber-hi">
                  {shelfYear ? `dash tracks from ${shelfYear} — earlier settlements are omitted` : ""}
                </span>
              </button>
              {shelfOpen && (
                <>
                  {shelf.length === 0 ? (
                    <p className="px-3.5 pb-4 pt-1 font-condensed text-[13.5px] text-dim border-t border-hairline-lo">
                      {shelfSlice.error
                        ? // Never the all-clear on a failed read: an empty
                          // shelf because the query fell over is not "nothing
                          // to chase" — the page has no idea what is out there.
                          "The settlements didn't come through — this shelf is not the whole story."
                        : shelfSlice.isLoading
                          ? "Reading the settlements…"
                          : "Every settled load this year has a load record in dash. Nothing to chase."}
                    </p>
                  ) : (
                    shelf.map((s) => {
                      // A known agency's row is a door into it; an unknown
                      // code's row is a `+` that names the agency behind it.
                      const known = s.agency;
                      const year = shelfYear ?? "this year";
                      return (
                        <AgencyRow
                          key={s.code}
                          ghosted
                          name={known?.name ?? s.code}
                          to={known ? `/agencies/${known.agency_id}` : undefined}
                          chips={
                            <>
                              {known && <CodeChip code={s.code} kind="agency" />}
                              <StatusPill tone="neutral">settlement only</StatusPill>
                            </>
                          }
                          context={
                            known
                              ? `${plural(s.loads, "load")} paid on a ${year} settlement with no load record in dash`
                              : `${plural(s.loads, "load")} in ${year} · no agency or contact on file`
                          }
                          cells={[
                            <RowCell
                              key="loads"
                              value={
                                <>
                                  <b className="text-ink">{s.loads}</b> · from lines
                                </>
                              }
                            />,
                            <RowCell key="rpm" value="—" sub="no miles" />,
                            <RowCell key="agents" value="—" />,
                          ]}
                          // No settled money on file is an em dash, never $0 —
                          // the LOAD is the fact here, the amount is evidence
                          // that may not have arrived.
                          right={{ value: s.revenue > 0 ? money(s.revenue) : "—", caption: "settled" }}
                          door={known ? "chevron" : "plus"}
                          openLabel={known ? `Open ${known.name ?? s.code}` : `Name the agency behind ${s.code}`}
                          onOpen={
                            known
                              ? () => navigate(`/agencies/${known.agency_id}`)
                              : () => setAdding({ code: s.code })
                          }
                        />
                      );
                    })
                  )}
                  <p className="px-3.5 py-2.5 border-t border-hairline-lo font-condensed text-[12px] text-faint leading-snug">
                    These rows never enter the ladder, the tiers or the Foreman — no miles, no agent, no footprint.
                  </p>
                </>
              )}
            </div>

            <p className="mt-3 font-condensed text-[11.5px] text-faint max-w-2xl leading-snug">
              An agency's numbers come off the LOADS booked through it, so a person who moves desks leaves their
              history behind. The people keep their own tiers and their own RPM — those live on the agent, not here.
              * = a load with no deadhead logged counted loaded miles only.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default AgenciesPage;
