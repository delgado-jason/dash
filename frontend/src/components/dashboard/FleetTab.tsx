import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import type { ExpensePeriod } from "@/types/expense";
import type { RateTargets } from "@/lib/metrics/rateTargets";
import { useFleetData } from "@/hooks/useFleetData";
import { milesHistory } from "@/lib/metrics/milesHistory";
import { MilesChart } from "@/components/dashboard/fleet/MilesChart";
import { computeTruckMetrics } from "@/lib/metrics/truckMetrics";
import { computeDue, fleetHealth, type Due, type DueLevel } from "@/lib/metrics/maintenance";
import { apuDueOptions } from "@/lib/metrics/apuHours";
import { shopSpend, fleetHeatmap, lastHomeDay, type DayStatus } from "@/lib/metrics/fleet";
import { hometimeStatus, lastHomeSignal } from "@/lib/metrics/hometime";
import { itemToCheckable, cdlToCheckable, computeComplianceDue, type ComplianceLevel } from "@/lib/metrics/compliance";
import { mpgWindows, monthlyFuelPrice } from "@/lib/metrics/fuelEconomy";
import { money, rpm, dieselPrice } from "@/lib/format";
import { Board, BoardCell } from "@/components/ui/Board";
import { Panel } from "@/components/ui/Panel";
import { PaceMeter } from "@/components/ui/PaceMeter";

// Plain since the Redesign's phase B1: "THE RIG" plate, the mile-club badge and
// the count-up were the game's; the figures stay, on the Panel every page uses.

const DAY_FILL: Record<DayStatus, string> = {
  underload: "var(--color-amber)",
  home: "var(--color-plate-b)",
  idle: "color-mix(in srgb, var(--color-amber) 40%, var(--color-well))",
};
const DUE_DOT: Record<DueLevel, string> = { overdue: "var(--color-status-negative-text)", soon: "var(--color-amber-hi)", ok: "var(--color-status-positive-text)", unknown: "var(--color-faint)" };
const DUE_RANK: Record<DueLevel, number> = { overdue: 0, soon: 1, ok: 2, unknown: 3 };
const COMP: Record<ComplianceLevel, { cls: string }> = {
  expired: { cls: "text-status-negative-text" }, expiring: { cls: "text-status-aware-text" },
  valid: { cls: "text-status-positive-text" }, unknown: { cls: "text-muted-text" },
};

const H3 = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <h3 className="ds2-label mb-2.5 flex justify-between items-center">
    {children}
    {right}
  </h3>
);

// miles preferred, then the APU's hours, else days; sign → overdue / remaining
const remain = (d: Due): string => {
  if (d.milesRemaining != null)
    return d.milesRemaining < 0
      ? `overdue ${Math.abs(Math.round(d.milesRemaining)).toLocaleString()} mi`
      : `in ${Math.round(d.milesRemaining).toLocaleString()} mi`;
  // An APU clock has no miles at all — it would otherwise print nothing here.
  if (d.hoursRemaining != null)
    return d.hoursRemaining < 0
      ? `overdue ${Math.abs(Math.round(d.hoursRemaining)).toLocaleString()} hrs`
      : `in ${Math.round(d.hoursRemaining).toLocaleString()} hrs`;
  if (d.daysRemaining != null)
    return d.daysRemaining < 0 ? `overdue ${Math.abs(Math.round(d.daysRemaining))}d` : `in ${Math.round(d.daysRemaining)}d`;
  return "";
};

// pnlCostPerMile / pnlWindow: the P&L's all-in cost per driven mile from the
// one basis (computeRateTargets), printed beside the rig's own figure so the
// two are never mistaken for each other (2026-11-04, §5 "Cost per mile").
// Twelve months on the miles chart (call 2): long enough to hold a season.
// Six would only ever show one of Jason's two thin stretches.
const MILES_MONTHS = 12;

export const FleetTab = ({
  loads,
  trips,
  periods,
  targets,
}: {
  loads: Load[];
  trips: Trip[];
  periods: ExpensePeriod[];
  targets: RateTargets; // the one basis — the chart's floor is the ladder's own
}) => {
  const now = useMemo(() => new Date(), []);
  const pnlCostPerMile = targets.basis.costPerTotalMile;
  const pnlWindow = targets.basis.windowLabel;
  // The rate you actually book to — the chart's one dashed reference rule.
  const bookingFloor = targets.bookingLadder?.walkAway ?? null;
  const mileRows = useMemo(
    () =>
      milesHistory(
        loads,
        trips,
        periods,
        targets.obligationsMonthly,
        targets.keep,
        now,
        MILES_MONTHS,
      ),
    [loads, trips, periods, targets.obligationsMonthly, targets.keep, now],
  );
  const fleet = useFleetData();
  const truck = fleet.trucks[0] ?? null;
  const trailer = fleet.trailers[0] ?? null;

  // single owner-operator: all loads are this truck's
  const metrics = useMemo(
    () => (truck ? computeTruckMetrics(truck, loads, fleet.fuel, fleet.services, now, fleet.homeDays, fleet.travelDays) : null),
    [truck, loads, fleet.fuel, fleet.services, fleet.homeDays, fleet.travelDays, now],
  );
  const shop = useMemo(() => shopSpend(fleet.services, now, 12), [fleet.services, now]);
  const heat = useMemo(() => fleetHeatmap(loads, fleet.homeDays, fleet.travelDays, now, 8), [loads, fleet.homeDays, fleet.travelDays, now]);

  // GL-140: the chip grades against the threshold in Settings and nothing
  // else — while the schedule is still loading (or has no threshold) it waits
  // rather than grading you against a guess.
  const home = useMemo(() => {
    if (fleet.hometimeThreshold == null) return null;
    const lh = lastHomeSignal(lastHomeDay(loads, fleet.homeDays, fleet.travelDays, now), fleet.homeTripDays, now);
    return hometimeStatus(lh, fleet.hometimeThreshold, now);
  }, [loads, fleet.homeDays, fleet.travelDays, fleet.homeTripDays, fleet.hometimeThreshold, now]);

  const dues = useMemo(() => {
    const cur = truck ? Number(truck.current_odometer) || null : null;
    const mpm = metrics?.milesPerMonth ?? null;
    // An APU clock is graded on HOURS — the same projection the Maintenance
    // page and the alert banners use. Handing it the truck odometer would make
    // a 568,737-mile number answer a 1,000-hour question.
    const { apu, hoursPerRoadDay, roadDayShare } = apuDueOptions(
      fleet.services,
      fleet.fuel,
      loads,
      now,
    );
    return fleet.items
      .filter((i) => i.active)
      .map((i) => ({
        name: i.name,
        item: i,
        due: computeDue(i, i.unit === "apu" ? null : cur, now, mpm, {
          currentHours: i.unit === "apu" ? apu.hours : null,
          hoursPerRoadDay,
          roadDayShare,
        }),
      }))
      .sort(
        (a, b) =>
          DUE_RANK[a.due.level] - DUE_RANK[b.due.level] ||
          (a.due.etaDate ?? "9999").localeCompare(b.due.etaDate ?? "9999"),
      );
  }, [fleet.items, fleet.services, fleet.fuel, loads, truck, metrics, now]);

  const counts = {
    overdue: dues.filter((d) => d.due.level === "overdue").length,
    soon: dues.filter((d) => d.due.level === "soon").length,
    ok: dues.filter((d) => d.due.level === "ok").length,
  };
  const health = fleetHealth(counts);
  const nextSoon = dues.find((d) => d.due.level === "soon");

  const chips = useMemo(() => {
    const checkables = [
      ...fleet.compliance.filter((c) => c.active).map(itemToCheckable),
      ...fleet.drivers.filter((d) => d.cdl_expiration).map(cdlToCheckable),
    ];
    return checkables
      .map((c) => ({ label: c.label, ...computeComplianceDue(c, now) }))
      .sort((a, b) => (a.level === "expired" ? 0 : a.level === "expiring" ? 1 : 2) - (b.level === "expired" ? 0 : b.level === "expiring" ? 1 : 2))
      .slice(0, 6);
  }, [fleet.compliance, fleet.drivers, now]);

  const mpgSeries = useMemo(() => mpgWindows(fleet.fuel).slice(-8).map((w) => w.mpg), [fleet.fuel]);
  const paidPerGal = useMemo(() => monthlyFuelPrice(fleet.fuel).at(-1)?.avgPrice ?? null, [fleet.fuel]);

  // Cost to run, all-in: fuel + maintenance + the rig's own note (monthly
  // truck + trailer payment ÷ miles/month). Fuel and maintenance come from
  // computeTruckMetrics — fuel is the 30-day tank-window rate, the SAME number
  // the fuel page answers with. Shares are by per-mile component so they
  // always sum to 100%. Fuel unknown (no recent full-tank window) ghosts the
  // whole stack — a fuel-less "cost to run" would understate by half.
  const mpm = metrics?.milesPerMonth ?? null;
  const fuelPerMile = metrics?.fuelPerMile ?? null;
  const maintPerMile = metrics?.maintPerMile ?? null;
  const notePerMile = mpm && mpm > 0 && fleet.assetNote > 0 ? fleet.assetNote / mpm : null;
  const costParts = (
    [
      { key: "fuel", label: "fuel (30-day)", v: fuelPerMile, color: "var(--color-cat1)" },
      { key: "maint", label: "maintenance (incl. APU)", v: maintPerMile, color: "var(--color-cat5)" },
      { key: "note", label: "truck + trailer note", v: notePerMile, color: "var(--color-cat3)" },
    ] as { key: string; label: string; v: number | null; color: string }[]
  ).filter((p): p is { key: string; label: string; v: number; color: string } => p.v != null);
  // Same null-gate as truckMetrics.costToRunPerMile — BOTH fuel and maint
  // known, or no total. A fuel-only stack here while the truck page shows "—"
  // would be two surfaces disagreeing on the same number.
  const costPerMile =
    fuelPerMile != null && maintPerMile != null
      ? costParts.reduce((s, p) => s + p.v, 0)
      : null;
  const costPct = (v: number) => (costPerMile && costPerMile > 0 ? Math.round((v / costPerMile) * 100) : 0);
  const dieselGap = paidPerGal != null && fleet.nationalDiesel != null ? paidPerGal - fleet.nationalDiesel : null;

  if (fleet.loading)
    return <div className="text-sm text-muted-text py-12 text-center">Loading your truck…</div>;
  if (!truck)
    return (
      <div className="text-sm text-muted-text py-12 text-center">
        No truck yet. <Link to="/trucks" className="text-status-info-text hover:underline">Add your truck</Link> to light this up.
      </div>
    );

  const rigName = [truck.year, truck.make, truck.model].filter(Boolean).join(" ") || "Your truck";
  const trailerName = trailer ? [trailer.year, trailer.make, trailer.model].filter(Boolean).join(" ") : null;
  const util = metrics?.utilization ?? null;
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  // util breakdown bar widths (guard the empty window)
  const wd = metrics?.windowDays || 1;
  const uUL = metrics ? (metrics.underLoadDays / wd) * 100 : 0;
  const uHome = metrics ? (metrics.homeDays / wd) * 100 : 0;
  const uIdle = metrics ? (metrics.idleDays / wd) * 100 : 0;

  // Auto-fit the y-axis to the actual tanks (± 0.3 padding) so real variance reads
  // instead of hugging a zero baseline — with a minimum span so a genuinely steady
  // week doesn't get blown up into a dramatic zigzag.
  let mmin = 0;
  let mmax = 1;
  if (mpgSeries.length > 0) {
    mmin = Math.min(...mpgSeries) - 0.3;
    mmax = Math.max(...mpgSeries) + 0.3;
    const MIN_SPAN = 1.5;
    if (mmax - mmin < MIN_SPAN) {
      const mid = (mmin + mmax) / 2;
      mmin = mid - MIN_SPAN / 2;
      mmax = mid + MIN_SPAN / 2;
    }
  }
  const mpgPts = mpgSeries
    .map((m, i) => `${8 + (i / Math.max(1, mpgSeries.length - 1)) * 304},${44 - ((m - mmin) / Math.max(0.1, mmax - mmin)) * 34}`)
    .join(" ");

  const smax = Math.max(...shop.months.map((m) => m.spend), 1);
  const bw = 400 / shop.months.length;

  return (
    <div className="flex flex-col gap-3">
      {/* THE CHART LEADS (the Redesign, phase C, call 1). Jason, Nov 9: "if my
          miles are low, it drives my rate up." It is the one panel on this tab
          that changes what he books tomorrow, so it sits above the truck's own
          business rather than under it. */}
      <Panel className="p-4" data-testid="miles-chart">
        <h3 className="ds2-label flex justify-between">
          Miles a month — and the floor they forced
          <span className="normal-case tracking-normal font-normal text-faint">
            loaded + empty · {MILES_MONTHS} months · the figure above each bar is
            that month&rsquo;s break-even
          </span>
        </h3>
        <div className="mt-3">
          <MilesChart rows={mileRows} bookingFloor={bookingFloor} />
        </div>
        <p className="text-[11.5px] text-faint mt-2.5">
          A thin month does not cost less — the notes, the insurance and the
          permits do not care how far you drove, so the same dollars land on
          fewer miles and every one has to carry more. A month with no P&amp;L
          filed keeps its bars and shows no floor ·{" "}
          <Link to="/market" className="text-amber-hi">
            the rate to book on Market ›
          </Link>
        </p>
      </Panel>

      {/* the truck's cost to run, and the next service she's rolling toward */}
      {(() => {
        const odo = Number(truck.current_odometer) || 0;
        const svc = nextSoon ?? dues.find((d) => d.due.level === "overdue") ?? null;
        const interval = svc?.item?.interval_miles != null ? Number(svc.item.interval_miles) : null;
        const remaining = svc?.due.milesRemaining ?? null;
        const consumed =
          interval != null && remaining != null ? Math.max(0, interval - remaining) : null;
        return (
          <Panel className="p-5" data-testid="truck-card">
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-6">
              <div>
                <p className="ds2-label">Truck {truck.unit_number} · cost to run</p>
                <p className="font-condensed font-semibold text-[34px] leading-none mt-1.5 tabular-nums">
                  {costPerMile != null ? rpm(costPerMile) : "—"}{" "}
                  <span className="text-[15px] text-dim font-condensed tracking-normal">
                    fuel + shop + note, per mile
                  </span>
                </p>
                <p className="text-[11.5px] text-faint mt-1">
                  {costPerMile != null
                    ? costParts.map((cp) => `${cp.label} ${rpm(cp.v)}`).join(" + ")
                    : "needs a full-tank fuel window in the last 30 days"}
                  {pnlCostPerMile != null && (
                    <>
                      {" "}· the P&amp;L's all-in <span className="text-dim tabular-nums">{rpm(pnlCostPerMile)}/mi</span>
                      {pnlWindow ? ` (${pnlWindow})` : ""} is on Expenses
                    </>
                  )}
                  {" · "}
                  <span className="text-dim tabular-nums">{odo.toLocaleString("en-US")} mi on the odometer</span>
                </p>
                {svc && consumed != null && interval != null ? (
                  <>
                    <PaceMeter
                      filled={consumed}
                      target={interval}
                      markers={[{ value: interval, label: `due · ${svc.name.toLowerCase()}` }]}
                    />
                    <p className="text-[11.5px] text-faint mt-1.5">
                      <b className="text-ink">{svc.name}</b> {remain(svc.due)} — past
                      the marker she's running overdue.
                    </p>
                  </>
                ) : (
                  <p className="text-[12px] text-faint mt-4">
                    {counts.overdue > 0
                      ? "Service overdue — see road-ready."
                      : "No mileage-based service tracked yet — add intervals on Maintenance."}
                  </p>
                )}
              </div>
              <div className="md:border-l md:border-hairline md:pl-6 flex flex-col justify-center gap-3">
                <div>
                  <p className="ds2-label">Service</p>
                  <p className={`font-condensed font-semibold text-[17px] mt-1 ${counts.overdue > 0 ? "text-status-negative-text" : nextSoon ? "text-amber-light" : "text-ink"}`}>
                    {counts.overdue > 0 ? `${counts.overdue} overdue` : nextSoon ? `${nextSoon.name} · ${remain(nextSoon.due)}` : counts.ok > 0 ? "all good" : "no schedule yet"}
                  </p>
                </div>
                {chips[0] && (
                  <div>
                    <p className="ds2-label">Compliance</p>
                    <p className={`font-condensed font-semibold text-[17px] mt-1 ${COMP[chips[0].level].cls}`}>
                      {chips[0].label} · {chips[0].level === "expired" ? `expired ${Math.abs(chips[0].daysRemaining ?? 0)}d` : chips[0].level === "expiring" ? `${chips[0].daysRemaining}d` : "ok"}
                    </p>
                  </div>
                )}
                <div>
                  <p className="ds2-label">Miles / month</p>
                  <p className="font-condensed font-semibold text-[17px] mt-1 tabular-nums text-ink">
                    {metrics?.milesPerMonth != null ? Math.round(metrics.milesPerMonth).toLocaleString("en-US") : "—"}
                  </p>
                </div>
              </div>
            </div>
          </Panel>
        );
      })()}

      {/* The cluster. Both speedometer dials retired here (the Redesign, phase
          C, call 5) — they were the last of the game's instruments, and each
          spent a hundred pixels square restating the figure beside it. The
          Utilization cell went with them (call 4): the stacked bar below shows
          what that percentage is actually made of. */}
      <Board className="grid grid-cols-1 sm:grid-cols-3">
        <div className="relative px-[18px] py-4 border-b sm:border-b-0 sm:border-r ds2-cell-rule">
          <p className="ds2-label">Fuel economy</p>
          <p className="font-condensed font-semibold text-[26px] leading-none tabular-nums mt-2">
            {metrics?.avgMpg != null ? metrics.avgMpg.toFixed(1) : "—"}
            <span className="text-[13px] text-dim"> mpg</span>
          </p>
          <p className="text-[10.5px] text-faint mt-1.5">
            {metrics?.bestTank != null
              ? `best tank ${metrics.bestTank.toFixed(1)} · lifetime, full tanks only`
              : "log a full tank"}
          </p>
        </div>
        <BoardCell
          className="sm:border-r ds2-cell-rule"
          label="Home time"
          value={!home ? "—" : home.state === "none" ? "—" : home.daysOut === 0 ? "home today" : `${home.daysOut} days out`}
          valueClassName={`text-[22px] ${home?.state === "over" ? "text-amber-light" : ""}`}
          sub={!home ? "waits for the home-time target in Settings" : home.state === "none" ? "no home marks yet" : home.state === "over" ? `past your ${home.threshold}-day target` : `${home.toTarget} left to your ${home.threshold}-day target`}
          tone={home?.state === "over" ? "amb" : "none"}
          to="/drivers"
          go="drivers"
        />
        <BoardCell
          label="Shop log · 12 mo"
          value={money(shop.total)}
          valueClassName="text-[22px]"
          sub={`${shop.serviceCount} services · ${shop.perMonth != null ? money(shop.perMonth) : "—"} / mo over ${shop.monthsLogged} logged · not the P&L`}
          tone={counts.overdue > 0 ? "amb" : "none"}
          to="/maintenance"
          go="maintenance"
        />
      </Board>

      {/* the rig + road-ready */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-3 items-start">
        <div className="ds2-board p-4">
          <H3 right={<span className="normal-case tracking-normal font-normal">under-load · home · idle, {metrics?.windowDays ?? 0}d</span>}>How hard she runs</H3>
          <p className="text-[13px] font-bold">{rigName} <span className="text-muted-text font-normal text-[11.5px]">· #{truck.unit_number} · {Number(truck.current_odometer).toLocaleString()} mi</span></p>
          {trailerName && <p className="text-[11px] text-muted-text mt-0.5">pulling a {trailerName} {trailer?.trailer_type} · #{trailer?.unit_number}</p>}

          <div className="flex h-[22px] rounded-md overflow-hidden my-2.5" style={{ border: "1px solid var(--color-hairline)" }}>
            {uUL > 0 && <div className="flex items-center justify-center text-[9.5px] font-bold" style={{ width: `${uUL}%`, background: "var(--color-amber)", color: "var(--color-on-amber)" }}>{util != null ? pct(util) : ""} rolling</div>}
            {uHome > 0 && <div style={{ width: `${uHome}%`, background: "var(--color-plate-b)" }} />}
            {uIdle > 0 && <div style={{ width: `${uIdle}%`, background: "color-mix(in srgb, var(--color-amber) 40%, var(--color-well))" }} />}
          </div>
          <div className="flex gap-3.5 text-[10px] text-muted-text">
            <span><i className="inline-block w-2 h-2 rounded-sm mr-1 align-[-1px]" style={{ background: "var(--color-amber)" }} />{metrics?.underLoadDays ?? 0} under load</span>
            <span><i className="inline-block w-2 h-2 rounded-sm mr-1 align-[-1px]" style={{ background: "var(--color-plate-b)" }} />{metrics?.homeDays ?? 0} home</span>
            <span><i className="inline-block w-2 h-2 rounded-sm mr-1 align-[-1px]" style={{ background: "color-mix(in srgb, var(--color-amber) 40%, var(--color-well))" }} />{metrics?.idleDays ?? 0} idle</span>
          </div>

          <div className="grid grid-cols-3 gap-2 my-3">
            {[
              { v: costPerMile != null ? rpm(costPerMile) : "—", l: "fuel + shop + note / mi" },
              { v: metrics?.revPerMile != null ? rpm(metrics.revPerMile) : "—", l: "revenue / mi", c: "var(--color-status-positive-text)" },
              { v: metrics?.milesPerMonth != null ? Math.round(metrics.milesPerMonth).toLocaleString() : "—", l: "miles / month" },
            ].map((e) => (
              <div key={e.l} className="rounded-lg px-2.5 py-1.5" style={{ background: "var(--color-well)", border: "1px solid var(--color-plate)" }}>
                <p className="text-[15px] font-bold" style={{ color: e.c }}>{e.v}</p>
                <p className="text-[9px] uppercase tracking-wide text-muted-text mt-0.5">{e.l}</p>
              </div>
            ))}
          </div>

          {mpgSeries.length >= 2 && (
            <div>
              <div className="flex justify-between text-[10px] uppercase tracking-wide text-muted-text"><span>Fuel economy — last {mpgSeries.length} tanks</span><span className="text-status-positive-text">{metrics?.avgMpg?.toFixed(1)} avg</span></div>
              <svg viewBox="0 0 320 50" className="w-full mt-1">
                <polyline fill="none" stroke="var(--color-chart-blue)" strokeWidth={2} points={mpgPts} />
                {mpgSeries.map((_, i) => {
                  const [x, y] = mpgPts.split(" ")[i].split(",");
                  return <circle key={i} cx={x} cy={y} r={i === mpgSeries.length - 1 ? 3 : 2.5} fill={i === mpgSeries.length - 1 ? "var(--color-amber-hi)" : "var(--color-chart-blue)"} />;
                })}
              </svg>
            </div>
          )}
          <Link to={`/trucks/${truck.truck_id}`} className="text-[11px] text-status-info-text hover:underline mt-2 inline-block">Truck details →</Link>
        </div>

        {/* road-ready */}
        <div className="ds2-board p-4">
          <H3 right={<span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full" style={{ color: health.color, background: "var(--color-status-aware-bg)", border: `1px solid color-mix(in srgb, ${health.color} 33%, transparent)` }}>{health.label}</span>}>Road-ready</H3>
          {dues.length === 0 ? (
            <p className="text-xs text-muted-text">No maintenance schedule yet.</p>
          ) : (
            dues.slice(0, 4).map((d, i) => (
              <div key={`${d.name}-${i}`} className="flex items-center gap-2 py-1.5 text-[12px] border-t first:border-t-0" style={{ borderColor: "var(--color-hairline-lo)" }}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: DUE_DOT[d.due.level] }} />
                <span className="truncate">{d.name}</span>
                <span className="ml-auto text-[11px] whitespace-nowrap" style={{ color: d.due.level === "overdue" ? "var(--color-status-negative-text)" : d.due.level === "soon" ? "var(--color-amber-hi)" : "var(--color-muted-text)" }}>
                  {d.due.level === "ok" ? "ok" : remain(d.due)}
                </span>
              </div>
            ))
          )}
          <Link to="/maintenance" className="text-[11px] text-status-info-text hover:underline mt-2 inline-block">Maintenance →</Link>
          {chips.length > 0 && (
            <div className="border-t mt-3 pt-2.5" style={{ borderColor: "var(--color-hairline-lo)" }}>
              <p className="text-[10px] uppercase tracking-wide text-muted-text font-bold mb-1.5">Compliance</p>
              <div className="flex flex-wrap gap-1.5">
                {chips.map((c, i) => (
                  <span key={`${c.label}-${i}`} className={`text-[10px] font-semibold px-2 py-0.5 rounded ${COMP[c.level].cls}`} style={{ background: "var(--color-well)", border: "1px solid var(--color-hairline)" }}>
                    {c.label} · {c.level === "expired" ? `expired ${Math.abs(c.daysRemaining ?? 0)}d` : c.level === "expiring" ? `${c.daysRemaining}d` : "ok"}
                  </span>
                ))}
              </div>
              <Link to="/compliance" className="text-[11px] text-status-info-text hover:underline mt-2 inline-block">Compliance →</Link>
            </div>
          )}
        </div>
      </div>

      {/* shop spend + cost to run */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-3 items-start">
        <div className="ds2-board p-4">
          <H3 right={<span className="normal-case tracking-normal font-normal">the shop log · last 12 months · the P&amp;L's Repairs line is the cost basis</span>}>Shop spend</H3>
          <div className="flex items-baseline gap-2.5 mb-1">
            <span className="text-[28px] font-extrabold leading-none">{money(shop.total)}</span>
            <span className="text-[11.5px] text-muted-text">{shop.serviceCount} services{shop.perMonth != null ? ` · ${money(shop.perMonth)} / mo over ${shop.monthsLogged} logged` : ""}</span>
          </div>
          {shop.total === 0 ? (
            <p className="text-xs text-muted-text py-3">No shop visits logged in the last 12 months.</p>
          ) : (
            <>
              <svg viewBox="0 0 400 96" className="w-full my-1">
                <line x1="0" y1="76" x2="400" y2="76" stroke="var(--color-hairline-lo)" />
                {shop.months.map((m, i) => {
                  const h = m.spend > 0 ? Math.max(3, (m.spend / smax) * 68) : 2;
                  const x = i * bw + 5, w = bw - 10, big = m.spend === smax && m.spend > 0;
                  return (
                    <g key={m.month}>
                      <rect x={x} y={76 - h} width={w} height={h} rx={2} fill={big ? "var(--color-amber-hi)" : m.spend > 0 ? "var(--color-chart-amber)" : "var(--color-plate-b)"} />
                      <text x={x + w / 2} y={90} textAnchor="middle" fontSize={8} fill="var(--color-faint)">{m.label.charAt(0)}</text>
                    </g>
                  );
                })}
              </svg>
              {shop.recent.map((s) => (
                <div key={s.date + s.description} className="flex items-center gap-2 py-1.5 text-[12px] border-t first:border-t-0" style={{ borderColor: "var(--color-hairline-lo)" }}>
                  <span className="text-muted-text w-9 shrink-0">{new Date(s.date.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}</span>
                  <span className="truncate min-w-0 flex-1">{s.description}</span>
                  <span className="ml-auto font-bold whitespace-nowrap">{money(s.cost)}</span>
                </div>
              ))}
            </>
          )}
          <Link to="/maintenance" className="text-[11px] text-status-info-text hover:underline mt-2 inline-block">Maintenance →</Link>
        </div>

        <div className="ds2-board p-4">
          <H3 right={<span className="normal-case tracking-normal font-normal">per mile · her own running cost · fuel on the last 30 days</span>}>Fuel + shop + note</H3>
          {costPerMile == null ? (
            <p className="text-xs text-muted-text">
              Needs a full-tank fuel window closed in the last 30 days — fuel is
              the biggest slice, so there's no honest total without it.
            </p>
          ) : (
            <>
              <div className="flex h-6 rounded-md overflow-hidden mb-2" style={{ border: "1px solid var(--color-hairline)" }}>
                {costParts.map((p) => (
                  <div key={p.key} className="flex items-center justify-center text-[9px] font-bold" style={{ width: `${costPct(p.v)}%`, background: p.color, color: "var(--color-on-amber)" }}>
                    {costPct(p.v) >= 14 ? `${costPct(p.v)}%` : ""}
                  </div>
                ))}
              </div>
              {costParts.map((p) => (
                <div key={p.key} className="flex justify-between text-[11.5px] py-0.5">
                  <span><b style={{ color: p.color }}>{rpm(p.v)}</b> {p.label} / mi</span>
                  <span className="text-muted-text">{costPct(p.v)}%</span>
                </div>
              ))}
              <div className="flex justify-between text-[11.5px] pt-1.5 mt-1 border-t" style={{ borderColor: "var(--color-hairline-lo)" }}>
                <span className="font-bold">{rpm(costPerMile)} total / mi</span>
                <span className="text-muted-text">
                  the truck's own running cost
                  {pnlCostPerMile != null ? ` · the P&L's all-in is ${rpm(pnlCostPerMile)}` : " · not the P&L's all-in"}
                </span>
              </div>
            </>
          )}
          {paidPerGal != null && (
            <p className="text-[11.5px] text-muted-text border-t mt-2.5 pt-2.5" style={{ borderColor: "var(--color-hairline-lo)" }}>
              Diesel you paid <b className="text-status-aware-text">{dieselPrice(paidPerGal)}</b>
              {fleet.nationalDiesel != null && <> · national <b className="text-light">{dieselPrice(fleet.nationalDiesel)}</b>{dieselGap != null && Math.abs(dieselGap) >= 0.005 && <> · you run <b style={{ color: dieselGap > 0 ? "var(--color-status-negative-text)" : "var(--color-status-positive-text)" }}>{Math.abs(dieselGap * 100).toFixed(0)}¢</b> {dieselGap > 0 ? "over" : "under"}</>}</>}
            </p>
          )}
        </div>
      </div>

      {/* the year in days */}
      <div className="ds2-board p-4">
        <H3 right={<span className="normal-case tracking-normal font-normal">each column = one week (Sun→Sat) · oldest left → this week right</span>}>The last eight weeks, day by day</H3>
        <div>
          <div className="w-full">
            <div className="relative h-3.5 mb-1">
              {heat.months.map((m) => (
                <span key={m.col} className="absolute text-[9px] text-dim" style={{ left: `${(m.col / Math.max(1, heat.weeks)) * 100}%` }}>{m.label}</span>
              ))}
            </div>
            <div className="grid gap-[4px] w-full" style={{ gridTemplateRows: "repeat(7, 16px)", gridAutoFlow: "column", gridAutoColumns: "1fr" }}>
              {heat.cells.map((c) => (
                <span key={c.date} title={`${c.date} · ${c.future ? "—" : c.status}`} className="w-full h-full rounded-[4px]"
                  style={{ background: c.future ? "transparent" : DAY_FILL[c.status] }} />
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-3.5 text-[10.5px] text-muted-text mt-2.5 flex-wrap">
          <span><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-[-1px]" style={{ background: "var(--color-amber)" }} />under a load (earning)</span>
          <span><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-[-1px]" style={{ background: "var(--color-plate-b)" }} />home</span>
          <span><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-[-1px]" style={{ background: "color-mix(in srgb, var(--color-amber) 40%, var(--color-well))" }} />idle</span>
        </div>
      </div>
    </div>
  );
};
