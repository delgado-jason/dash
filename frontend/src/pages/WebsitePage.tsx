import { useEffect, useMemo, useState } from "react";
import { useSiteTraffic } from "@/hooks/useSiteTraffic";
import type { SiteHit, TrafficWindow } from "@/types/siteTraffic";
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
// the board keeps its rounded corners.
const Fig = ({
  label,
  value,
  note,
  divide,
}: {
  label: string;
  value: number;
  note?: string;
  divide?: boolean;
}) => (
  <div
    className={`p-4 ${
      divide ? "border-t sm:border-t-0 sm:border-l border-hairline-lo" : ""
    }`}
  >
    <span className="ds2-label">{label}</span>
    <div className="font-display text-[36px] leading-none text-hot tabular-nums tracking-[.02em] mt-1.5">
      {value}
    </div>
    {note && (
      <span className="block mt-1 font-condensed text-[13px] text-faint">
        {note}
      </span>
    )}
  </div>
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

const WebsitePage = () => {
  const [win, setWin] = useState<TrafficWindow>(readWindow);
  const { traffic, loading, error } = useSiteTraffic(win);

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
        <StatCardsSkeleton count={3} />
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
        <div className="ds2-board grid grid-cols-1 sm:grid-cols-3 mt-4">
          <Fig label={`Visitors · ${label}`} value={summary.visitors} />
          <Fig label={`Page views · ${label}`} value={summary.views} divide />
          <Fig
            label="Today"
            value={summary.todayViews}
            note={`${summary.todayVisitors} visitor${
              summary.todayVisitors === 1 ? "" : "s"
            } · 7-day average ${avg(summary.avg7Visitors)}`}
            divide
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
