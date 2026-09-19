import { useEffect, useMemo, useState } from "react";
import { useSiteTraffic } from "@/hooks/useSiteTraffic";
import { useSiteSubscribers } from "@/hooks/useSiteSubscribers";
import { syncSiteSubscribers } from "@/services/siteSubscribersService";
import type {
  SiteHit,
  SiteSubscriber,
  SiteSubscribers,
  TrafficWindow,
} from "@/types/siteTraffic";
import {
  latestVisits,
  topPages,
  topReferrers,
  topStates,
  trafficSummary,
  visitorsByDay,
  visitorsByWeek,
  type TrafficWeek,
} from "@/lib/metrics/siteTraffic";
import { shortDate } from "@/lib/relationships/dayKeys";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { SegControl } from "@/components/ui/SegControl";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCardsSkeleton, BlockSkeleton } from "@/components/ui/PageSkeletons";

const WINDOW_KEY = "dash.website.window";

const WINDOWS: { value: TrafficWindow; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "12m", label: "12 months" },
];

const DEFAULT_WINDOW: TrafficWindow = "30d";

const readWindow = (): TrafficWindow => {
  try {
    const saved = localStorage.getItem(WINDOW_KEY);
    return WINDOWS.some((w) => w.value === saved)
      ? (saved as TrafficWindow)
      : DEFAULT_WINDOW;
  } catch {
    return DEFAULT_WINDOW; // storage blocked — the control still works, it just won't remember
  }
};

const windowLabel = (win: TrafficWindow): string =>
  WINDOWS.find((w) => w.value === win)?.label ?? "";

const day = (key: string): string => shortDate(key) ?? key;

// A hit's `ts` is an INSTANT, so a timeZone format is exactly right here — this
// is the one place on the page that turns a moment into Jason's clock.
const when = (ts: string): string =>
  new Date(ts).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const pct = (share: number | null): string =>
  share == null ? "—" : `${Math.round(share * 100)}%`;

const avg = (n: number | null): string => (n == null ? "—" : n.toFixed(1));

// One figure in the strip. The dividers are drawn by the cells themselves so
// the board keeps its rounded corners — and each cell carries its OWN rule,
// because the strip reflows 1 → 2 → 4 columns and which edge a cell needs a
// hairline on depends on where it lands in each of those.
const Fig = ({
  label,
  value,
  note,
  rule = "",
}: {
  label: string;
  // null is "this number didn't load" — only the subscribers cell can be null,
  // and it prints the same em dash every other unknown on this page prints.
  value: number | null;
  note?: string;
  rule?: string;
}) => (
  <div className={`p-4 ${rule}`}>
    <span className="ds2-label">{label}</span>
    <div className="font-display text-[36px] leading-none text-hot tabular-nums tracking-[.02em] mt-1.5">
      {value == null ? "—" : value}
    </div>
    {note && (
      <span className="block mt-1 font-condensed text-[13px] text-faint">
        {note}
      </span>
    )}
  </div>
);

// Where an address stands with Kit. GradeChip's shape (Lanes), not
// StatusPill's: twenty-five of these stack in one table and the leading dots
// turn a column into a constellation. `sent` is deliberately the quiet one —
// it's the normal, uninteresting state between the form and the reader
// clicking Kit's link.
const KIT_TONE: Record<SiteSubscriber["kit_status"], string> = {
  pending: "bg-amber/10 text-amber-hi",
  sent: "bg-white/[.07] text-dim",
  confirmed: "bg-status-positive-text/12 text-status-positive-text",
  unsubscribed: "border border-dashed border-hairline text-faint",
  failed: "bg-status-negative-text/12 text-status-negative-text",
};

const KitPill = ({ status }: { status: SiteSubscriber["kit_status"] }) => (
  <span
    className={`inline-flex items-center h-[17px] px-[5px] rounded font-condensed font-bold text-[9.5px] tracking-[.06em] uppercase ${KIT_TONE[status]}`}
  >
    {status}
  </span>
);

// Top pages / Came from / States all draw the same list: a name, a count, and
// (for the two that are shares of the same total) a percentage.
const ListBoard = ({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: { key: string; label: string; count: number; share?: number | null }[];
  empty: string;
}) => (
  <div className="ds2-board overflow-hidden">
    <div className="px-4 py-2.5">
      <span className="ds2-label">{title}</span>
    </div>
    {rows.length === 0 ? (
      <div className="px-4 py-2 border-t border-hairline-lo font-condensed text-[14px] text-faint">
        {empty}
      </div>
    ) : (
      rows.map((r) => (
        <div
          key={r.key}
          className="flex items-baseline gap-2.5 px-4 py-2 border-t border-hairline-lo font-condensed text-[14px] text-ink"
        >
          <span className="truncate" title={r.label}>
            {r.label}
          </span>
          <span className="ml-auto tabular-nums">{r.count}</span>
          {r.share !== undefined && (
            <span className="w-10 text-right text-dim tabular-nums">
              {pct(r.share)}
            </span>
          )}
        </div>
      ))
    )}
  </div>
);

// The Logbook's list — a board of its own rather than a fourth column in the
// row above, because these are people and not counts. The address is shown in
// FULL: it is Jason's list, and a masked address is no use to him when he is
// trying to recognise a name. It carries its own error line for the same
// reason it has its own fetch — a Kit-shaped problem must not take the
// visitor boards down with it.
const SignupsBoard = ({
  subscribers,
  error,
  onSync,
  syncing,
  syncNote,
}: {
  subscribers: SiteSubscribers | null;
  error: string | null;
  onSync: () => void;
  syncing: boolean;
  syncNote: string | null;
}) => (
  <div className="ds2-board mt-4 overflow-hidden">
    <div className="px-4 py-2.5 flex items-center gap-3">
      <span className="ds2-label">Latest signups</span>
      {/* Pressing it is the act of handing addresses to Kit — a button, never
          a page load (see the route's comment). The answer lands in the note. */}
      <button
        type="button"
        onClick={onSync}
        disabled={syncing || !subscribers}
        className="ml-auto h-7 px-3 rounded-[8px] bg-well border border-hairline font-condensed font-semibold text-[12px] tracking-[.05em] uppercase text-amber-hi hover:text-hot disabled:opacity-50 disabled:hover:text-amber-hi transition-colors"
      >
        {syncing ? "Syncing…" : "Sync to Kit ›"}
      </button>
    </div>
    {syncNote && (
      <div className="px-4 pb-2.5 -mt-1 font-condensed text-[12.5px] text-dim">{syncNote}</div>
    )}
    <div className="overflow-x-auto">
      <table className="w-full font-condensed text-[14px]">
        <thead>
          <tr className="text-left border-t border-hairline-lo">
            {["When", "Address", "From", "Status"].map((h) => (
              <th key={h} className="px-4 py-2 font-normal">
                <span className="ds2-label">{h}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {error || !subscribers || subscribers.latest.length === 0 ? (
            <tr className="border-t border-hairline-lo">
              <td
                className={`px-4 py-2 ${error ? "text-destructive" : "text-faint"}`}
                colSpan={4}
              >
                {error ??
                  (subscribers
                    ? "No signups yet — the Logbook's form goes live with the site's next deploy."
                    : "loading…")}
              </td>
            </tr>
          ) : (
            subscribers.latest.map((s) => (
              <tr key={s.subscriber_id} className="border-t border-hairline-lo">
                <td className="px-4 py-2 text-dim whitespace-nowrap tabular-nums">
                  {when(s.ts)}
                </td>
                <td className="px-4 py-2 max-w-[320px] truncate" title={s.email}>
                  {s.email}
                </td>
                <td
                  className="px-4 py-2 text-dim max-w-[300px] truncate"
                  title={s.source_path ?? undefined}
                >
                  {s.source_path ?? "—"}
                </td>
                <td className="px-4 py-2">
                  <KitPill status={s.kit_status} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </div>
);

const WebsitePage = () => {
  const [win, setWin] = useState<TrafficWindow>(readWindow);
  const { traffic, loading, error } = useSiteTraffic(win);
  // A second, independent fetch. The page belongs to the traffic — if the
  // signups fail to load, the figure shows an em dash and the board shows a
  // line, and every visitor board stays exactly where it was.
  const {
    subscribers,
    error: subsError,
    refetch: refetchSubscribers,
  } = useSiteSubscribers(win);

  // The Sync to Kit press: one request, one line of outcome, then the board
  // re-reads itself so the pills move.
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const handleSync = async () => {
    setSyncing(true);
    try {
      const r = await syncSiteSubscribers();
      setSyncNote(
        r.skipped
          ? "Kit isn't configured yet — put KIT_API_KEY and KIT_FORM_ID on Railway, then sync again."
          : `Sent ${r.sent ?? 0} · failed ${r.failed ?? 0} · asked Kit about ${r.checked ?? 0}: ${r.confirmed ?? 0} confirmed, ${r.unsubscribed ?? 0} unsubscribed`,
      );
      refetchSubscribers();
    } catch {
      setSyncNote("The sync didn't run — try again in a moment.");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(WINDOW_KEY, win);
    } catch {
      /* a browser with storage blocked still gets the control, just not the memory */
    }
  }, [win]);

  // One pass over the window's hits for the whole page. 12 months is folded
  // into weeks — 365 bars is a smear, 52 is a shape. Everything keys off
  // traffic.window, the window the DATA is for, never the control's pending
  // selection: while a switch is in flight the boards keep their own label.
  const view = useMemo(() => {
    if (!traffic) return null;
    const daily = visitorsByDay(traffic.hits, traffic.from, traffic.today);
    const bars: TrafficWeek[] =
      traffic.window === "12m"
        ? visitorsByWeek(daily)
        : daily.map((r) => ({ ...r, from: r.day }));
    return {
      summary: trafficSummary(traffic.hits, traffic.today, traffic.from),
      bars,
      pages: topPages(traffic.hits, 10),
      refs: topReferrers(traffic.hits, 10),
      states: topStates(traffic.hits, 10),
      latest: latestVisits(traffic.hits, 25),
    };
  }, [traffic]);

  // Only the FIRST load swaps in the skeleton; changing the window keeps the
  // boards on screen until the new ones land.
  if (loading && !traffic)
    return (
      <div className="p-6 text-ink font-body min-h-screen">
        <Skeleton className="h-8 w-32 mb-6" />
        <StatCardsSkeleton count={4} />
        <BlockSkeleton className="h-32 mt-6" />
        <BlockSkeleton className="h-64 mt-6" />
      </div>
    );

  if (error)
    return (
      <div className="p-6 text-ink font-body">
        <p className="text-destructive">{error}</p>
      </div>
    );

  if (!traffic || !view) return null;

  const { summary, bars, pages, refs, states, latest } = view;
  const label = windowLabel(traffic.window);
  const tallest = Math.max(1, ...bars.map((b) => b.visitors));
  const nothingYet = traffic.hits.length === 0;

  return (
    <div className="min-h-screen text-ink font-body">
      {/* Desktop-first, the same width as Lanes: the day bars and three lists
          side by side want the room. It stacks on a phone. */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-[18px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">
            Website
          </h1>
          <span className="font-condensed font-medium text-[15px] text-dim">
            delgadotruckingservices.com · live from the site
          </span>
          <span className="flex-1" />
          <SegControl
            ariaLabel="Traffic window"
            options={WINDOWS}
            value={win}
            onChange={setWin}
          />
        </div>

        {/* ---- the figures ---- */}
        <div className="ds2-board grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mt-4">
          <Fig label={`Visitors · ${label}`} value={summary.visitors} />
          <Fig
            label={`Page views · ${label}`}
            value={summary.views}
            rule="border-t sm:border-t-0 sm:border-l border-hairline-lo"
          />
          <Fig
            label="Today"
            value={summary.todayViews}
            note={`${summary.todayVisitors} visitor${
              summary.todayVisitors === 1 ? "" : "s"
            } · 7-day average ${avg(summary.avg7Visitors)}`}
            rule="border-t lg:border-t-0 lg:border-l border-hairline-lo"
          />
          <Fig
            label={`Subscribers · ${label}`}
            value={subscribers?.window_count ?? null}
            note={
              subscribers
                ? `${subscribers.total} total`
                : (subsError ?? "loading…")
            }
            rule="border-t sm:border-l lg:border-t-0 border-hairline-lo"
          />
        </div>

        {/* ---- the bars ---- */}
        <div className="ds2-board mt-4 px-4 pt-2.5 pb-3.5">
          <span className="ds2-label">
            {traffic.window === "12m" ? "Visitors by week" : "Visitors by day"}
          </span>
          <div className="flex items-end gap-[3px] h-14 mt-2">
            {bars.map((b, i) => {
              const last = i === bars.length - 1;
              const span =
                b.from === b.day ? day(b.day) : `${day(b.from)} – ${day(b.day)}`;
              return (
                <div
                  key={b.day}
                  title={`${span} · ${b.visitors} visitor${
                    b.visitors === 1 ? "" : "s"
                  } · ${b.views} view${b.views === 1 ? "" : "s"}`}
                  className="flex-1 rounded-t-[2px]"
                  style={{
                    // A day nobody came is still a day: it keeps its slot as a
                    // 2px hairline rather than disappearing out of the row.
                    height: `${(b.visitors / tallest) * 100}%`,
                    minHeight: 2,
                    background:
                      b.visitors === 0
                        ? "var(--color-hairline)"
                        : last
                          ? "var(--color-hot)"
                          : "var(--color-amber)",
                    opacity: last || b.visitors === 0 ? 1 : 0.5,
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* ---- the three lists ---- */}
        <div className="grid lg:grid-cols-3 gap-4 mt-4">
          <ListBoard
            title="Top pages"
            empty="nothing yet"
            rows={pages.map((p) => ({
              key: p.path,
              label: p.path,
              count: p.views,
              share: p.share,
            }))}
          />
          <ListBoard
            title="Came from"
            empty="nothing yet"
            rows={refs.map((r) => ({
              key: r.host,
              label: r.host,
              count: r.views,
              share: r.share,
            }))}
          />
          <ListBoard
            title="States"
            empty="nothing yet"
            rows={states.map((s) => ({
              key: s.region,
              label: s.name,
              count: s.visitors,
            }))}
          />
        </div>

        {/* ---- the Logbook's signups ---- */}
        <SignupsBoard
          subscribers={subscribers}
          error={subsError}
          onSync={handleSync}
          syncing={syncing}
          syncNote={syncNote}
        />

        {/* ---- the last 25 ---- */}
        <div className="ds2-board mt-4 overflow-hidden">
          <div className="px-4 py-2.5">
            <span className="ds2-label">Latest visits</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full font-condensed text-[14px]">
              <thead>
                <tr className="text-left border-t border-hairline-lo">
                  {["When", "Page", "State", "Came from", "Device"].map((h) => (
                    <th key={h} className="px-4 py-2 font-normal">
                      <span className="ds2-label">{h}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {latest.length === 0 ? (
                  <tr className="border-t border-hairline-lo">
                    <td className="px-4 py-2 text-faint" colSpan={5}>
                      nothing yet
                    </td>
                  </tr>
                ) : (
                  latest.map((h: SiteHit) => (
                    <tr key={h.hit_id} className="border-t border-hairline-lo">
                      <td className="px-4 py-2 text-dim whitespace-nowrap tabular-nums">
                        {when(h.ts)}
                      </td>
                      <td className="px-4 py-2 max-w-[360px] truncate" title={h.path}>
                        {h.path}
                      </td>
                      <td className="px-4 py-2 text-dim">{h.region ?? "—"}</td>
                      <td className="px-4 py-2 text-dim">
                        {h.ref_host ?? "direct"}
                      </td>
                      <td className="px-4 py-2 text-dim">{h.device}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="ds2-label mt-3">
          {nothingYet
            ? "No visits yet — the beacon goes live with the site's next deploy."
            : "no cookies · no IPs stored · crawlers dropped · counted by day, Central time"}
        </p>
      </div>
    </div>
  );
};

export default WebsitePage;
