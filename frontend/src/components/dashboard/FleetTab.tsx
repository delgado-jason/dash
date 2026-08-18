import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { Load } from "@/types/load";
import { useFleetData } from "@/hooks/useFleetData";
import { computeTruckMetrics } from "@/lib/metrics/truckMetrics";
import { computeDue, fleetHealth, type Due, type DueLevel } from "@/lib/metrics/maintenance";
import { shopSpend, fleetHeatmap, lastHomeDay, type DayStatus } from "@/lib/metrics/fleet";
import { hometimeStatus } from "@/lib/metrics/hometime";
import { itemToCheckable, cdlToCheckable, computeComplianceDue, type ComplianceLevel } from "@/lib/metrics/compliance";
import { mpgWindows, monthlyFuelPrice } from "@/lib/metrics/fuelEconomy";
import { money, rpm, dieselPrice } from "@/lib/format";
import { Board, BoardCell } from "@/components/ui/Board";
import { ForgedPlate } from "@/components/ui/ForgedPlate";
import { PaceMeter } from "@/components/ui/PaceMeter";
import { GaugeDial } from "@/components/ui/GaugeDial";
import { CountUp } from "@/components/ui/CountUp";
import { mileMilestone, fmtMiles } from "@/lib/metrics/mileClub";

const HOME_TARGET_FALLBACK = 42; // only if the settlement-schedule setting is missing

const DAY_FILL: Record<DayStatus, string> = {
  underload: "linear-gradient(180deg, var(--color-hot), var(--color-amber))",
  home: "var(--color-plate-b)",
  idle: "#5a4218",
};
const DUE_DOT: Record<DueLevel, string> = { overdue: "#f87171", soon: "#f5a623", ok: "#2f7d55", unknown: "#5b6577" };
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

// miles preferred, else days; sign → overdue / remaining
const remain = (d: Due): string => {
  if (d.milesRemaining != null)
    return d.milesRemaining < 0
      ? `overdue ${Math.abs(Math.round(d.milesRemaining)).toLocaleString()} mi`
      : `in ${Math.round(d.milesRemaining).toLocaleString()} mi`;
  if (d.daysRemaining != null)
    return d.daysRemaining < 0 ? `overdue ${Math.abs(Math.round(d.daysRemaining))}d` : `in ${Math.round(d.daysRemaining)}d`;
  return "";
};

export const FleetTab = ({ loads }: { loads: Load[] }) => {
  const now = useMemo(() => new Date(), []);
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

  const home = useMemo(() => {
    const lh = lastHomeDay(loads, fleet.homeDays, fleet.travelDays, now);
    return hometimeStatus(lh, fleet.hometimeThreshold ?? HOME_TARGET_FALLBACK, now);
  }, [loads, fleet.homeDays, fleet.travelDays, fleet.hometimeThreshold, now]);

  const dues = useMemo(() => {
    const cur = truck ? Number(truck.current_odometer) || null : null;
    const mpm = metrics?.milesPerMonth ?? null;
    return fleet.items
      .filter((i) => i.active)
      .map((i) => ({ name: i.name, item: i, due: computeDue(i, cur, now, mpm) }))
      .sort(
        (a, b) =>
          DUE_RANK[a.due.level] - DUE_RANK[b.due.level] ||
          (a.due.etaDate ?? "9999").localeCompare(b.due.etaDate ?? "9999"),
      );
  }, [fleet.items, truck, metrics, now]);

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
  // computeTruckMetrics — fuel is the 90-day tank-window rate, the SAME number
  // the fuel page answers with. Shares are by per-mile component so they
  // always sum to 100%. Fuel unknown (no recent full-tank window) ghosts the
  // whole stack — a fuel-less "cost to run" would understate by half.
  const mpm = metrics?.milesPerMonth ?? null;
  const fuelPerMile = metrics?.fuelPerMile ?? null;
  const maintPerMile = metrics?.maintPerMile ?? null;
  const notePerMile = mpm && mpm > 0 && fleet.assetNote > 0 ? fleet.assetNote / mpm : null;
  const costParts = (
    [
      { key: "fuel", label: "fuel (90-day)", v: fuelPerMile, color: "var(--color-cat1)" },
      { key: "maint", label: "maintenance", v: maintPerMile, color: "var(--color-cat5)" },
      { key: "note", label: "truck + trailer note", v: notePerMile, color: "var(--color-cat3)" },
    ] as { key: string; label: string; v: number | null; color: string }[]
  ).filter((p): p is { key: string; label: string; v: number; color: string } => p.v != null);
  const costPerMile =
    fuelPerMile != null && costParts.length ? costParts.reduce((s, p) => s + p.v, 0) : null;
  const costPct = (v: number) => (costPerMile && costPerMile > 0 ? Math.round((v / costPerMile) * 100) : 0);
  const dieselGap = paidPerGal != null && fleet.nationalDiesel != null ? paidPerGal - fleet.nationalDiesel : null;

  if (fleet.loading)
    return <div className="text-sm text-muted-text py-12 text-center">Loading your rig…</div>;
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
      {/* THE RIG — the forged surface: what she costs to run, and the next
          service she's rolling toward. (Mile clubs demoted to a badge — a
          506-week chase is no chase; clubs stay as trophies.) */}
      {(() => {
        const odo = Number(truck.current_odometer) || 0;
        const club = mileMilestone(odo);
        const svc = nextSoon ?? dues.find((d) => d.due.level === "overdue") ?? null;
        const interval = svc?.item?.interval_miles != null ? Number(svc.item.interval_miles) : null;
        const remaining = svc?.due.milesRemaining ?? null;
        const consumed =
          interval != null && remaining != null ? Math.max(0, interval - remaining) : null;
        return (
          <ForgedPlate chamfer tilt className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr] gap-6">
              <div>
                <p className="ds2-label">Truck {truck.unit_number} — the rig</p>
                <p className="font-display text-[34px] tracking-[.02em] leading-none mt-1.5 tabular-nums">
                  {costPerMile != null ? (
                    <CountUp value={costPerMile} format={(n) => rpm(n)} />
                  ) : (
                    "—"
                  )}{" "}
                  <span className="text-[15px] text-dim font-condensed tracking-normal">
                    to run, per mile
                  </span>
                </p>
                <p className="text-[11.5px] text-faint mt-1">
                  {costPerMile != null
                    ? costParts.map((cp) => `${cp.label} ${rpm(cp.v)}`).join(" + ")
                    : "forges after a full-tank fuel window in the last 90 days"}
                  {" · "}
                  <span className="text-dim tabular-nums">{odo.toLocaleString("en-US")} on the clock</span>
                  {club.next ? (
                    <span className="text-faint"> · {fmtMiles(club.next)} club is {club.toNext.toLocaleString("en-US")} mi out</span>
                  ) : null}
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
              <div className="md:border-l md:border-white/10 md:pl-6 flex flex-col justify-center gap-3">
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
          </ForgedPlate>
        );
      })()}

      {/* the cluster — two speedometers + two doors */}
      <Board className="grid grid-cols-2 md:grid-cols-4">
        <div className="relative px-[18px] py-4 border-b md:border-b-0 md:border-r ds2-cell-rule">
          <p className="ds2-label">Fuel economy</p>
          <div className="flex items-center gap-3 mt-1">
            <GaugeDial value={metrics?.avgMpg ?? 0} min={4} max={9} size={104} />
            <div>
              <p className="font-condensed font-semibold text-[26px] leading-none tabular-nums">
                {metrics?.avgMpg != null ? metrics.avgMpg.toFixed(1) : "—"}
                <span className="text-[13px] text-dim"> mpg</span>
              </p>
              <p className="text-[10.5px] text-faint mt-1">
                {metrics?.bestTank != null ? `best tank ${metrics.bestTank.toFixed(1)}` : "log a full tank"}
              </p>
            </div>
          </div>
        </div>
        <div className="relative px-[18px] py-4 border-b md:border-b-0 md:border-r ds2-cell-rule">
          <p className="ds2-label">Utilization</p>
          <div className="flex items-center gap-3 mt-1">
            <GaugeDial value={util != null ? util * 100 : 0} min={0} max={100} size={104} />
            <div>
              <p className={`font-condensed font-semibold text-[26px] leading-none tabular-nums ${util != null && util >= 0.8 ? "text-status-positive-text" : ""}`}>
                {util != null ? pct(util) : "—"}
              </p>
              <p className="text-[10.5px] text-faint mt-1">
                {metrics ? `${metrics.idleDays} idle days in window` : "no loads yet"}
              </p>
            </div>
          </div>
        </div>
        <BoardCell
          className="md:border-r ds2-cell-rule"
          label="Home time"
          value={home.state === "none" ? "—" : home.daysOut === 0 ? "home today" : `${home.daysOut} days out`}
          valueClassName={`text-[22px] ${home.state === "over" ? "text-amber-light" : ""}`}
          sub={home.state === "none" ? "no home marks yet" : home.state === "over" ? `past your ${home.threshold}-day target` : `${home.toTarget} left to your ${home.threshold}-day target`}
          tone={home.state === "over" ? "amb" : "none"}
          to="/drivers"
          go="drivers"
        />
        <BoardCell
          label="Shop spend · 12 mo"
          value={money(shop.total)}
          valueClassName="text-[22px]"
          sub={`${shop.serviceCount} services · ${money(shop.total / 12)} / mo`}
          tone={counts.overdue > 0 ? "amb" : "none"}
          to="/maintenance"
          go="maintenance"
        />
      </Board>

      {/* the rig + road-ready */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-3 items-start">
        <div className="ds2-board p-4">
          <H3 right={<span className="normal-case tracking-normal font-normal">under-load · home · idle, {metrics?.windowDays ?? 0}d</span>}>How hard she runs</H3>
          <p className="text-[13px] font-bold">{rigName} <span className="text-muted-text font-normal text-[11.5px]">· #{truck.unit_number} · {Number(truck.current_odometer).toLocaleString()} mi</span></p>
          {trailerName && <p className="text-[11px] text-muted-text mt-0.5">pulling a {trailerName} {trailer?.trailer_type} · #{trailer?.unit_number}</p>}

          <div className="flex h-[22px] rounded-md overflow-hidden my-2.5" style={{ border: "1px solid #26304a" }}>
            {uUL > 0 && <div className="flex items-center justify-center text-[9.5px] font-bold" style={{ width: `${uUL}%`, background: "linear-gradient(180deg,var(--color-hot),var(--color-amber))", color: "var(--color-canvas)" }}>{util != null ? pct(util) : ""} rolling</div>}
            {uHome > 0 && <div style={{ width: `${uHome}%`, background: "var(--color-plate-b)" }} />}
            {uIdle > 0 && <div style={{ width: `${uIdle}%`, background: "#5a4218" }} />}
          </div>
          <div className="flex gap-3.5 text-[10px] text-muted-text">
            <span><i className="inline-block w-2 h-2 rounded-sm mr-1 align-[-1px]" style={{ background: "var(--color-amber)" }} />{metrics?.underLoadDays ?? 0} under load</span>
            <span><i className="inline-block w-2 h-2 rounded-sm mr-1 align-[-1px]" style={{ background: "var(--color-plate-b)" }} />{metrics?.homeDays ?? 0} home</span>
            <span><i className="inline-block w-2 h-2 rounded-sm mr-1 align-[-1px]" style={{ background: "#5a4218" }} />{metrics?.idleDays ?? 0} idle</span>
          </div>

          <div className="grid grid-cols-3 gap-2 my-3">
            {[
              { v: costPerMile != null ? rpm(costPerMile) : "—", l: "cost to run / mi" },
              { v: metrics?.revPerMile != null ? rpm(metrics.revPerMile) : "—", l: "revenue / mi", c: "#4ade80" },
              { v: metrics?.milesPerMonth != null ? Math.round(metrics.milesPerMonth).toLocaleString() : "—", l: "miles / month" },
            ].map((e) => (
              <div key={e.l} className="rounded-lg px-2.5 py-1.5" style={{ background: "#121a27", border: "1px solid #22304a" }}>
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
          <H3 right={<span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full" style={{ color: health.color, background: "#1c1408", border: `1px solid ${health.color}55` }}>{health.label}</span>}>Road-ready</H3>
          {dues.length === 0 ? (
            <p className="text-xs text-muted-text">No maintenance schedule yet.</p>
          ) : (
            dues.slice(0, 4).map((d, i) => (
              <div key={`${d.name}-${i}`} className="flex items-center gap-2 py-1.5 text-[12px] border-t first:border-t-0" style={{ borderColor: "#1a2233" }}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: DUE_DOT[d.due.level] }} />
                <span className="truncate">{d.name}</span>
                <span className="ml-auto text-[11px] whitespace-nowrap" style={{ color: d.due.level === "overdue" ? "#f87171" : d.due.level === "soon" ? "#f5a623" : "#8b93a3" }}>
                  {d.due.level === "ok" ? "ok" : remain(d.due)}
                </span>
              </div>
            ))
          )}
          <Link to="/maintenance" className="text-[11px] text-status-info-text hover:underline mt-2 inline-block">Maintenance →</Link>
          {chips.length > 0 && (
            <div className="border-t mt-3 pt-2.5" style={{ borderColor: "#1a2233" }}>
              <p className="text-[10px] uppercase tracking-wide text-muted-text font-bold mb-1.5">Compliance</p>
              <div className="flex flex-wrap gap-1.5">
                {chips.map((c, i) => (
                  <span key={`${c.label}-${i}`} className={`text-[10px] font-semibold px-2 py-0.5 rounded ${COMP[c.level].cls}`} style={{ background: "#0e1420", border: "1px solid #26304a" }}>
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
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-3 items-start">
        <div className="ds2-board p-4">
          <H3 right={<span className="normal-case tracking-normal font-normal">keeping her running · last 12 months</span>}>Shop spend</H3>
          <div className="flex items-baseline gap-2.5 mb-1">
            <span className="text-[28px] font-extrabold leading-none">{money(shop.total)}</span>
            <span className="text-[11.5px] text-muted-text">{shop.serviceCount} services{metrics?.milesPerMonth ? ` · ${money(shop.total / 12)} / mo` : ""}</span>
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
                      <text x={x + w / 2} y={90} textAnchor="middle" fontSize={8} fill="#5b6577">{m.label.charAt(0)}</text>
                    </g>
                  );
                })}
              </svg>
              {shop.recent.map((s) => (
                <div key={s.date + s.description} className="flex items-center gap-2 py-1.5 text-[12px] border-t first:border-t-0" style={{ borderColor: "#1a2233" }}>
                  <span className="text-muted-text w-9 shrink-0">{new Date(s.date.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}</span>
                  <span className="truncate">{s.description}</span>
                  <span className="ml-auto font-bold whitespace-nowrap">{money(s.cost)}</span>
                </div>
              ))}
            </>
          )}
          <Link to="/maintenance" className="text-[11px] text-status-info-text hover:underline mt-2 inline-block">Maintenance →</Link>
        </div>

        <div className="ds2-board p-4">
          <H3 right={<span className="normal-case tracking-normal font-normal">per mile</span>}>Cost to run</H3>
          {costPerMile == null ? (
            <p className="text-xs text-muted-text">
              Needs a full-tank fuel window closed in the last 90 days — fuel is
              the biggest slice, so there's no honest total without it.
            </p>
          ) : (
            <>
              <div className="flex h-6 rounded-md overflow-hidden mb-2" style={{ border: "1px solid #26304a" }}>
                {costParts.map((p) => (
                  <div key={p.key} className="flex items-center justify-center text-[9px] font-bold" style={{ width: `${costPct(p.v)}%`, background: p.color, color: "#0d1119" }}>
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
              <div className="flex justify-between text-[11.5px] pt-1.5 mt-1 border-t" style={{ borderColor: "#1a2233" }}>
                <span className="font-bold">{rpm(costPerMile)} total / mi</span>
                <span className="text-muted-text">all-in to keep her rolling</span>
              </div>
            </>
          )}
          {paidPerGal != null && (
            <p className="text-[11.5px] text-muted-text border-t mt-2.5 pt-2.5" style={{ borderColor: "#1a2233" }}>
              Diesel you paid <b className="text-status-aware-text">{dieselPrice(paidPerGal)}</b>
              {fleet.nationalDiesel != null && <> · national <b className="text-light">{dieselPrice(fleet.nationalDiesel)}</b>{dieselGap != null && Math.abs(dieselGap) >= 0.005 && <> · you run <b style={{ color: dieselGap > 0 ? "#f87171" : "#4ade80" }}>{Math.abs(dieselGap * 100).toFixed(0)}¢</b> {dieselGap > 0 ? "over" : "under"}</>}</>}
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
          <span><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-[-1px]" style={{ background: "linear-gradient(180deg,var(--color-hot),var(--color-amber))" }} />under a load (earning)</span>
          <span><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-[-1px]" style={{ background: "var(--color-plate-b)" }} />home</span>
          <span><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-[-1px]" style={{ background: "#5a4218" }} />idle</span>
        </div>
      </div>
    </div>
  );
};
