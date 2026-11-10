import { DEFAULT_DETENTION_FREE_HOURS } from "@/lib/detention";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Zap } from "lucide-react";
import { useLoads } from "@/hooks/useLoads";
import { useRateTargets } from "@/hooks/useRateTargets";
import { useMaintenanceAlerts } from "@/hooks/useMaintenanceAlerts";
import { useComplianceAlerts } from "@/hooks/useComplianceAlerts";
import { useIntegrity } from "@/hooks/useIntegrity";
import { useLocalTodayKey } from "@/hooks/useLocalToday";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AlertBanners } from "@/components/dashboard/AlertBanners";
import { DispatchLoadsTable } from "@/components/dashboard/DispatchLoadsTable";
import { DeskLeaderboardPanel } from "@/components/dashboard/agents/DeskLeaderboardPanel";
import { DispatcherChip } from "@/components/dashboard/DispatcherChip";
import { Panel } from "@/components/ui/Panel";
import { dispatchBoard, type OwedKind } from "@/lib/metrics/dispatchBoard";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import { rpm as fmtRpm } from "@/lib/format";

// "today" · "tomorrow" · "Thu Nov 12". A dispatcher thinks in those words, not
// in dates — and the first two are the only ones that change what she does now.
const whenWord = (key: string, today: string): string => {
  if (key === today) return "today";
  const t = new Date(`${today}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  if (key === t.toISOString().slice(0, 10)) return "tomorrow";
  const d = new Date(`${key}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
};

const OWED_WORDS: Record<OwedKind, (n: number) => string> = {
  detention: (n) => `Detention to claim on ${n} load${n === 1 ? "" : "s"}`,
  appointment: (n) => `${n} pickup${n === 1 ? "" : "s"} inside three days with no window set`,
  intime: (n) => `${n} rolling load${n === 1 ? "" : "s"} with no in-time logged`,
};

// ISO-8601 week number, UTC-anchored like every other date in the app.
const isoWeek = (d: Date): number => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const jan1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7);
};
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Brandie's board — operational only. No net revenue, RPM, or P&L; gross pace
// (which she books) is her chase surface. Detention is hours, not dollars.
// Plain since the Redesign's phase B1 (the Cockpit, calls 10 and 11): the rank
// chip, the heat meter, the award pops and the quarter race board are gone; her
// booking figures are plain cards, and the one honest signal the meter carried
// — the quarter's weeks over break-even — is a plain stat.
const DispatchDashboard = () => {
  const { loads, isLoading: loadsLoading, error: loadsError } = useLoads(0);
  // The viewer's open Integrity count — the data rows she can fix (call 2); the
  // chip hides at zero and while loading (call 1).
  const integrity = useIntegrity();
  const integrityOpen = integrity.loading ? 0 : integrity.visible.length;
  const targets = useRateTargets(loads);
  const alerts = [...useMaintenanceAlerts(loads), ...useComplianceAlerts()];
  const now = new Date();
  const todayKey = useLocalTodayKey();

  // Free-time setting drives what counts as detention (same source as Loads).
  const [freeHours, setFreeHours] = useState(DEFAULT_DETENTION_FREE_HOURS);
  useEffect(() => {
    getSettlementSchedule()
      .then((s) => setFreeHours(s.detention_free_hours))
      .catch(() => {});
  }, []);

  // Her OWN booking figures were derived here, split from the account-wide
  // ones (issue #465). They moved to /my-recap in v1.270.0 — a worklist should
  // not compete with a report card, and that page already does month, quarter
  // and year properly. The trips feed left with the deadhead tile.

  const isLoading = loadsLoading;
  const error = loadsError;

  if (isLoading)
    return (
      <div className="p-6 text-ink min-h-screen font-body">
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" style={{ borderRadius: 13 }} />
          ))}
        </div>
        <Skeleton className="h-28 mt-6" style={{ borderRadius: 13 }} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
          <Skeleton className="h-56" style={{ borderRadius: 13 }} />
          <Skeleton className="h-56" style={{ borderRadius: 13 }} />
        </div>
      </div>
    );

  if (error)
    return (
      <div className="p-6 text-ink min-h-screen">
        <p className="text-destructive">{error}</p>
      </div>
    );

  // Everything the three bands need, and nothing else. The five KPI cells and
  // the pace meter that used to live here took a dozen more derivations with
  // them (v1.270.0) — the monthly deadhead trend, the load-count delta, her
  // week's earned/committed gross, the gauge geometry. None of it answered
  // "is the truck covered", which is the only question this page has.
  const board = dispatchBoard(loads, freeHours, todayKey);
  // Red when there is nothing behind the work in hand: an empty truck costs
  // money every hour, and no other state on this page does.
  const gapIsOpen = board.gap.sittingNow || board.gap.booked === 0;
  // The floor a load has to beat — the one booking figure that survives here,
  // because it is an instruction rather than a score.
  const cur: number | null = targets.grossRate ?? null;

  const dateLine = [
    now.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    }),
    `Week ${isoWeek(now)}`,
    ...(targets.weekStart
      ? [
          (() => {
            const ws = new Date(targets.weekStart);
            return `pay week ${DAY[ws.getUTCDay()]}–${DAY[(ws.getUTCDay() + 6) % 7]}`;
          })(),
        ]
      : []),
  ].join(" · ");

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        {/* full-bleed statusbar: her identity and her one big button */}
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">
            DISPATCH BOARD
          </h1>
          <span className="font-condensed font-medium text-[15px] text-dim">
            {dateLine}
          </span>
          <span className="flex-1" />
          <DispatcherChip />
          {integrityOpen > 0 && (
            <Link
              to="/integrity"
              className="inline-flex items-center gap-[7px] h-[26px] px-[11px] rounded-full border border-hairline font-condensed font-semibold text-[12.5px] tracking-[.08em] whitespace-nowrap text-amber-hi hover:text-hot"
            >
              INTEGRITY · {integrityOpen} OPEN ›
            </Link>
          )}
          <Link
            to="/score"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[10px] font-condensed font-semibold text-[14.5px] tracking-[.05em] bg-amber text-on-amber whitespace-nowrap hover:brightness-105"
          >
            <Zap size={15} /> SCORE A LOAD
          </Link>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <AlertBanners alerts={alerts} />

          {/* NOW · NEXT · OWED (v1.270.0, Nod Sheet "Brandie's board").
              This was five KPI cells — two of them monthly aggregates she
              cannot act on today — above her own pace meter and the quarter's
              weeks. The one urgent fact, that nothing is booked behind the
              load that is rolling, sat in a fifth of a strip between "Loads ·
              MTD" and "Deadhead · MTD".
              She has one question that repeats on a horizon of hours: is the
              truck covered, and what do I do next? The bands answer it in that
              order, and they change colour with the state — a covered week and
              an empty one should not look the same at a glance. */}
          <div className="flex flex-col gap-3">
            <Panel
              className="p-4"
              style={board.now.length > 0 ? { borderColor: "var(--color-amber)" } : undefined}
            >
              <p className="ds2-label">
                Now
                <span className="ml-2 normal-case tracking-normal text-faint font-normal">
                  {board.now.length === 0 ? "nothing on the road" : "on the road"}
                </span>
              </p>
              {board.now.length === 0 ? (
                <p className="font-condensed text-[13.5px] text-faint mt-2">
                  No load is rolling. Anything booked shows under Next.
                </p>
              ) : (
                board.now.map((r) => (
                  <div key={r.load.load_id ?? r.load.load_number} className="mt-2.5">
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <span className="font-condensed font-semibold text-[15px]">
                        <Link to={`/loads/${r.load.load_id}`} className="hover:text-amber-hi">
                          {r.load.load_number}
                        </Link>{" "}
                        <span className="text-dim">
                          {r.load.origin_city}, {r.load.origin_state} → {r.load.destination_city}, {r.load.destination_state}
                        </span>
                      </span>
                      <span className="font-condensed text-[13px] text-dim">
                        {r.deliversOn
                          ? <>delivers <b className="text-ink">{r.deliversAt ? `${r.deliversAt} ` : ""}{whenWord(r.deliversOn, todayKey)}</b></>
                          : "no delivery date set"}
                      </span>
                    </div>
                    {r.needsInTime && (
                      <p className="font-condensed text-[12.5px] mt-1" style={{ color: "var(--color-status-negative-text)" }}>
                        No in-time logged at the shipper — detention cannot be counted on this load until it is.{" "}
                        <Link to={`/loads/${r.load.load_id}`} className="underline-offset-2 hover:underline">Fix ›</Link>
                      </p>
                    )}
                  </div>
                ))
              )}
            </Panel>

            {/* The gap. Red when the truck has nothing behind it, because that
                is the state that costs money every hour it lasts. */}
            <Panel
              className="p-4"
              style={gapIsOpen ? { borderColor: "var(--color-status-negative-text)" } : undefined}
            >
              <p className="ds2-label">
                Next
                <span
                  className="ml-2 normal-case tracking-normal font-normal"
                  style={{ color: gapIsOpen ? "var(--color-status-negative-text)" : "var(--color-faint)" }}
                >
                  {board.gap.sittingNow
                    ? "the truck is sitting"
                    : board.gap.booked === 0
                      ? "nothing booked behind it"
                      : `${board.gap.booked} booked behind it`}
                </span>
              </p>
              <div className="flex items-baseline justify-between gap-3 flex-wrap mt-2">
                <span className="font-condensed text-[14.5px]">
                  {board.gap.sittingNow ? (
                    <b style={{ color: "var(--color-status-negative-text)" }}>Empty now — every hour is an empty hour.</b>
                  ) : board.gap.freeOn ? (
                    <>
                      Truck free{" "}
                      <b style={{ color: gapIsOpen ? "var(--color-status-negative-text)" : "var(--color-ink)" }}>
                        {board.gap.freeAt ? `${board.gap.freeAt} ` : ""}{whenWord(board.gap.freeOn, todayKey)}
                      </b>
                      {board.gap.freeCity && <> in <b className="text-ink">{board.gap.freeCity}, {board.gap.freeState}</b></>}
                    </>
                  ) : (
                    <span className="text-faint">No delivery date on the work in hand — the free moment is unknown.</span>
                  )}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <Link
                    to="/foreman"
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[9px] font-condensed font-semibold text-[12.5px] tracking-[.06em] uppercase bg-amber text-on-amber hover:brightness-105"
                  >
                    <Zap size={13} /> The Foreman
                  </Link>
                  <Link
                    to="/score"
                    className="inline-flex items-center h-8 px-3 rounded-[9px] font-condensed font-semibold text-[12.5px] tracking-[.06em] uppercase border border-hairline text-dim hover:text-ink"
                  >
                    Score a load
                  </Link>
                </span>
              </div>
              {cur != null && (
                <p className="font-condensed text-[12.5px] text-faint mt-2">
                  booking floor <b className="text-dim tabular-nums">{fmtRpm(cur)}</b>/mi gross — what a load has to beat
                </p>
              )}
            </Panel>

            {/* Her chase list. Quiet by design: these cost money slowly, and
                none of them is more urgent than an empty truck. */}
            <Panel className="p-4">
              <p className="ds2-label">
                Owed
                <span className="ml-2 normal-case tracking-normal text-faint font-normal">
                  {board.owed.length === 0 && integrityOpen === 0 ? "nothing to chase" : "what needs a call"}
                </span>
              </p>
              {board.owed.length === 0 && integrityOpen === 0 ? (
                <p className="font-condensed text-[13.5px] text-faint mt-2">
                  Detention claimed, appointments set, no rows to fix.
                </p>
              ) : (
                <div className="mt-1.5">
                  {board.owed.map((o) => (
                    <div key={o.kind} className="flex items-baseline justify-between gap-3 py-[7px] border-b ds2-cell-rule last:border-b-0">
                      <span className="font-condensed text-[14px]">{OWED_WORDS[o.kind](o.count)}</span>
                      <span className="font-condensed text-[12px] text-faint truncate max-w-[45%] text-right">
                        {o.loads.slice(0, 3).join(" · ")}
                        {o.loads.length > 3 && ` +${o.loads.length - 3}`}
                      </span>
                    </div>
                  ))}
                  {integrityOpen > 0 && (
                    <div className="flex items-baseline justify-between gap-3 py-[7px] border-b ds2-cell-rule last:border-b-0">
                      <span className="font-condensed text-[14px]">
                        {integrityOpen} row{integrityOpen === 1 ? "" : "s"} to fix
                      </span>
                      <Link to="/integrity" className="font-condensed text-[12px] text-amber-hi underline-offset-2 hover:underline">
                        Integrity ›
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </Panel>
          </div>

          {/* The loads table stays — it is the detail she already knows how
              to use. The agents table came OFF in v1.270.0: it ranked agents
              by gross with 🥇🥈🥉 medals, directly above a desk board doing
              the same ranking better. Two leaderboards on one page, and the
              second one was mine (v1.266.0). One is enough. */}
          <DispatchLoadsTable loads={loads} freeHours={freeHours} />

          {/* Which desks actually pay — the same board the owner sees. She
              books the freight; she should be able to see the rates. */}
          <div className="mt-3">
            <DeskLeaderboardPanel loads={loads} ladder={targets.bookingLadder} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default DispatchDashboard;
