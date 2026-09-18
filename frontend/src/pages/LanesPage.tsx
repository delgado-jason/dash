import { useEffect, useMemo, useState } from "react";
import { useLoads } from "@/hooks/useLoads";
import { useRateTargets } from "@/hooks/useRateTargets";
import { useCityCoords } from "@/hooks/useCityCoords";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import type { SettlementSchedule } from "@/types/settlementSchedule";
import { cityKey, emptyNextAnchor } from "@/lib/metrics/foreman";
import { getRegion } from "@/lib/constants/states";
import {
  LEDGER_WINDOWS,
  DEFAULT_WINDOW,
  buildLedger,
  ledgerHeadline,
  marketDetail,
  repeatLanes,
  sequenceLoads,
  windowLoads,
  type LedgerGrain,
  type LedgerWindow,
} from "@/lib/metrics/marketLedger";
import { LanesMap, type MapPin } from "@/components/lanes/LanesMap";
import { MarketLedger } from "@/components/lanes/MarketLedger";
import { RepeatLanesBoard } from "@/components/lanes/RepeatLanesBoard";
import { MarketDetailPanel } from "@/components/lanes/MarketDetailPanel";
import type { MapMetric } from "@/components/lanes/mapColor";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { SegControl as Seg } from "@/components/ui/SegControl";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCardsSkeleton, BlockSkeleton } from "@/components/ui/PageSkeletons";
import { rpm as fmtRpm } from "@/lib/format";

const LANES_KEY = "dash.lanes.showLanes";

// The answering line never prints a figure it doesn't have.
const days1 = (n: number | null): string => (n == null ? "—" : n.toFixed(1));
const miles0 = (n: number | null): string =>
  n == null ? "—" : String(Math.round(n));

const METRICS: { value: MapMetric; label: string }[] = [
  { value: "out", label: "OUT · $/mi" },
  { value: "in", label: "IN · reload" },
  { value: "volume", label: "Volume" },
];

const GRAINS: { value: LedgerGrain; label: string }[] = [
  { value: "state", label: "States" },
  { value: "region", label: "Regions" },
];

const readShowLanes = (): boolean => {
  try {
    return localStorage.getItem(LANES_KEY) === "1";
  } catch {
    return false;
  }
};

const LanesPage = () => {
  const [refreshKey] = useState(0);
  // One clock for the whole render, taken once — every window boundary and
  // every day-key comparison below has to agree with itself.
  const [now] = useState(() => new Date());
  const [win, setWin] = useState<LedgerWindow>(DEFAULT_WINDOW);
  const [metric, setMetric] = useState<MapMetric>("out");
  const [grain, setGrain] = useState<LedgerGrain>("state");
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [showLanes, setShowLanes] = useState<boolean>(readShowLanes);
  const [schedule, setSchedule] = useState<SettlementSchedule | null>(null);

  const { loads, isLoading, error } = useLoads(refreshKey);
  // Hooks never sit under an early return.
  const targets = useRateTargets(loads);
  const coords = useCityCoords(loads);

  const seq = useMemo(() => sequenceLoads(loads), [loads]);
  // The window's own loads — the ledger rolls the rows up from exactly these,
  // and the answering line counts exactly these.
  const scoped = useMemo(() => windowLoads(loads, win, now), [loads, win, now]);
  const rows = useMemo(
    () => buildLedger(loads, win, now, grain),
    [loads, win, now, grain],
  );
  const head = useMemo(
    () => ledgerHeadline(rows, scoped, grain),
    [rows, scoped, grain],
  );
  const lanes = useMemo(() => repeatLanes(loads, win, now), [loads, win, now]);

  const freeHours = schedule ? Number(schedule.detention_free_hours) : 3;
  const detail = useMemo(
    () =>
      selected
        ? marketDetail(loads, seq, win, now, selected, grain, freeHours)
        : null,
    [selected, loads, seq, win, now, grain, freeHours],
  );

  // Where you'll be empty next, straight from the Foreman, projected with the
  // map's own projection. Nothing drawn when the city has no coordinate yet.
  const pin = useMemo<MapPin | null>(() => {
    const anchor = emptyNextAnchor(loads);
    if (!anchor) return null;
    const c = coords.get(cityKey(anchor.city, anchor.state));
    return c
      ? { city: anchor.city, state: anchor.state, lat: c.lat, lng: c.lng }
      : null;
  }, [loads, coords]);

  useEffect(() => {
    getSettlementSchedule().then(setSchedule).catch(() => {});
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LANES_KEY, showLanes ? "1" : "0");
    } catch {
      /* a browser with storage blocked still gets the toggle, just not the memory */
    }
  }, [showLanes]);

  if (isLoading)
    return (
      <div className="p-6 text-ink font-body min-h-screen">
        <Skeleton className="h-8 w-28 mb-6" />
        <StatCardsSkeleton count={3} />
        <BlockSkeleton className="h-80 mt-6" />
        <BlockSkeleton className="h-56 mt-6" />
      </div>
    );

  if (error)
    return (
      <div className="p-6 text-ink font-body">
        <p className="text-destructive">{error}</p>
      </div>
    );

  const areaWord = grain === "state" ? "state" : "region";
  const emptyPct =
    head.emptyShare == null ? null : Math.round(head.emptyShare * 100);

  return (
    <div className="min-h-screen text-ink font-body">
      {/* Wider than the rest of dash (1180): a working map and a nine-column
          ledger side by side need the room, and this page is desktop-first. */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-[18px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">
            LANES
          </h1>
          <span className="font-condensed font-medium text-[15px] text-dim">
            where your freight is born, and what each stop leaves you
          </span>
          <span className="flex-1" />
          <Seg
            ariaLabel="Ledger window"
            options={LEDGER_WINDOWS}
            value={win}
            onChange={setWin}
          />
          <Seg
            ariaLabel="Map metric"
            options={METRICS}
            value={metric}
            onChange={setMetric}
          />
          <Seg
            ariaLabel="Ledger grain"
            options={GRAINS}
            value={grain}
            onChange={(g) => {
              setGrain(g);
              setSelected(null); // a state key doesn't exist at region grain
              setHovered(null);
            }}
          />
        </div>

        {/* the answering line — every clause drops out when its figure is null */}
        <div className="flex items-baseline gap-3 flex-wrap mt-4 font-condensed text-[14px] text-dim">
          <span className="font-display text-[21px] tracking-[.03em] tabular-nums text-ink">
            {head.loads} LOAD{head.loads === 1 ? "" : "S"}
          </span>
          <span>
            · {head.originStates} origin {areaWord}
            {head.originStates === 1 ? "" : "s"} · {head.deliveryStates} delivery{" "}
            {areaWord}
            {head.deliveryStates === 1 ? "" : "s"}
            {emptyPct != null && (
              <>
                {" "}
                · <b className="font-semibold text-ink">{emptyPct}%</b> of your miles
                empty
              </>
            )}
            {head.bestOut && (
              <>
                {" "}
                · best market to load{" "}
                <b className="font-semibold text-status-positive-text">
                  {head.bestOut.state} {fmtRpm(head.bestOut.out.typicalRpm)}/mi
                </b>{" "}
                ({head.bestOut.out.loads})
              </>
            )}
            {head.easiestIn && (
              <>
                {" "}
                · easiest place to get empty{" "}
                <b className="font-semibold text-status-positive-text">
                  {head.easiestIn.state}
                </b>{" "}
                ({miles0(head.easiestIn.in.reloadMilesMedian)} mi,{" "}
                {days1(head.easiestIn.in.idleDaysAvg)} days)
              </>
            )}
            {head.costliestIn && (
              <>
                {" "}
                · costliest{" "}
                <b className="font-semibold text-status-negative-text">
                  {head.costliestIn.state}
                </b>{" "}
                ({miles0(head.costliestIn.in.reloadMilesMedian)} mi,{" "}
                {days1(head.costliestIn.in.idleDaysAvg)} days)
              </>
            )}
            {/* said once, here: a delivered load with no pickup date can't be
                sequenced, so it is out of every IN figure on the page */}
            {head.undated > 0 && <> · {head.undated} undated</>}
          </span>
        </div>

        {/* One row, two boards of ONE height: the map sets it (its SVG keeps
            its aspect), the ledger is absolutely placed inside its cell so it
            never stretches the row — it fills the map's height and scrolls
            vertically inside, never sideways (Jason, 2026-09-16). Below lg
            the two stack and the ledger flows naturally. */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.15fr] gap-4 mt-4 items-stretch">
          <div className="ds2-board p-3.5 lg:min-h-[440px] flex flex-col">
            <div className="flex items-center gap-2.5 flex-wrap pb-2.5">
              <span className="ds2-label">Where the freight lives</span>
              <span className="ml-auto flex items-center gap-2.5 font-condensed text-[11.5px] text-amber-hi">
                hover a {areaWord} · click to pin ·
                <label className="flex items-center gap-1.5 text-dim cursor-pointer select-none">
                  lanes
                  <input
                    type="checkbox"
                    checked={showLanes}
                    onChange={(e) => setShowLanes(e.target.checked)}
                    className="accent-[#e8940a]"
                  />
                </label>
              </span>
            </div>
            <LanesMap
              rows={rows}
              metric={metric}
              selected={selected}
              onSelect={setSelected}
              showLanes={showLanes}
              lanes={lanes.rows}
              pin={pin}
              hoverRow={(row) => setHovered(row?.state ?? null)}
              hovered={hovered}
            />
          </div>

          <div className="relative lg:min-h-0">
            <div className="ds2-board overflow-hidden flex flex-col lg:absolute lg:inset-0">
              <div className="flex items-center gap-2.5 px-3.5 pt-2.5 pb-1.5 shrink-0">
                <span className="ds2-label">The market ledger</span>
                <span className="ml-auto font-condensed text-[11.5px] text-amber-hi">
                  sorted by OUT $/mi · 2+ loads
                </span>
              </div>
              <MarketLedger
                rows={rows}
                daily={targets.gross}
                selected={selected}
                onSelect={setSelected}
                hovered={hovered}
                onHover={setHovered}
                grainWord={areaWord}
              />
            </div>
          </div>
        </div>

        <RepeatLanesBoard
          lanes={lanes}
          daily={targets.gross}
          onSelect={(state) => {
            // A lane row knows its origin STATE; at region grain the ledger is
            // keyed by the freight region that state belongs to.
            const key = grain === "state" ? state : getRegion(state);
            setSelected(rows.some((r) => r.state === key) ? key : null);
          }}
        />

        {detail && selected && (
          <MarketDetailPanel
            detail={detail}
            market={selected}
            outGrade={
              rows.find((r) => r.state === selected)?.out.grade ?? "thin"
            }
            onClear={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
};

export default LanesPage;
