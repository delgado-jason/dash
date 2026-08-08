import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { Load } from "@/types/load";
import { useFleetData } from "@/hooks/useFleetData";
import { computeTruckMetrics } from "@/lib/metrics/truckMetrics";
import { computeDue, fleetHealth, type Due, type DueLevel } from "@/lib/metrics/maintenance";
import { shopSpend, fleetHeatmap, type DayStatus } from "@/lib/metrics/fleet";
import { hometimeStatus } from "@/lib/metrics/hometime";
import { itemToCheckable, cdlToCheckable, computeComplianceDue, type ComplianceLevel } from "@/lib/metrics/compliance";
import { mpgWindows, monthlyFuelPrice } from "@/lib/metrics/fuelEconomy";
import { money, rpm, dieselPrice } from "@/lib/format";

const C = { background: "#0f1622", border: "1px solid #26304a" } as const;
const TILE = { background: "#121a27", border: "1px solid #26304a" } as const;
const HOME_TARGET_FALLBACK = 42; // only if the settlement-schedule setting is missing

const DAY_FILL: Record<DayStatus, string> = { underload: "#2f7d55", home: "#3a5170", idle: "#232c3d" };
const DUE_DOT: Record<DueLevel, string> = { overdue: "#f87171", soon: "#f5a623", ok: "#2f7d55", unknown: "#5b6577" };
const DUE_RANK: Record<DueLevel, number> = { overdue: 0, soon: 1, ok: 2, unknown: 3 };
const COMP: Record<ComplianceLevel, { cls: string }> = {
  expired: { cls: "text-status-negative-text" }, expiring: { cls: "text-status-aware-text" },
  valid: { cls: "text-status-positive-text" }, unknown: { cls: "text-muted-text" },
};

const Tile = ({ label, value, sub, color, warn }: { label: string; value: string; sub: string; color?: string; warn?: boolean }) => (
  <div className="rounded-xl px-3.5 py-3" style={warn ? { background: "#1c1408", border: "1px solid #7a3b12" } : TILE}>
    <p className="text-[9.5px] uppercase tracking-wide text-muted-text">{label}</p>
    <p className="text-[17px] font-bold mt-0.5 leading-tight truncate" style={{ color }}>{value}</p>
    <p className="text-[10px] text-muted-text mt-0.5 truncate">{sub}</p>
  </div>
);

const H3 = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <h3 className="text-[11px] uppercase tracking-wide text-muted-text font-bold mb-2.5 flex justify-between items-center">
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
    () => (truck ? computeTruckMetrics(truck, loads, fleet.fuel, fleet.services, now, fleet.homeDays) : null),
    [truck, loads, fleet.fuel, fleet.services, fleet.homeDays, now],
  );
  const shop = useMemo(() => shopSpend(fleet.services, now, 12), [fleet.services, now]);
  const heat = useMemo(() => fleetHeatmap(loads, fleet.homeDays, now, 26), [loads, fleet.homeDays, now]);

  const home = useMemo(
    () => hometimeStatus(fleet.lastHome, fleet.hometimeThreshold ?? HOME_TARGET_FALLBACK, now),
    [fleet.lastHome, fleet.hometimeThreshold, now],
  );

  const dues = useMemo(() => {
    const cur = truck ? Number(truck.current_odometer) || null : null;
    const mpm = metrics?.milesPerMonth ?? null;
    return fleet.items
      .filter((i) => i.active)
      .map((i) => ({ name: i.name, due: computeDue(i, cur, now, mpm) }))
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

  // Split fuel vs maintenance from the SPEND components (both dollars) so the
  // shares always sit in 0–100% and the per-mile figures share one denominator.
  const costPerMile = metrics?.costToRunPerMile ?? null; // (fuel + maint) ÷ total miles
  const runSpend = (metrics?.fuelSpend ?? 0) + (metrics?.maintSpend ?? 0);
  const tMiles = metrics?.totalMiles ?? 0;
  const fuelPerMile = tMiles > 0 ? (metrics?.fuelSpend ?? 0) / tMiles : null;
  const maintPerMile = tMiles > 0 ? (metrics?.maintSpend ?? 0) / tMiles : null;
  const fuelPct = runSpend > 0 ? Math.round(((metrics?.fuelSpend ?? 0) / runSpend) * 100) : null;
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

  const mmin = Math.min(...mpgSeries, 0), mmax = Math.max(...mpgSeries, 1);
  const mpgPts = mpgSeries
    .map((m, i) => `${8 + (i / Math.max(1, mpgSeries.length - 1)) * 304},${44 - ((m - mmin) / Math.max(0.1, mmax - mmin)) * 34}`)
    .join(" ");

  const smax = Math.max(...shop.months.map((m) => m.spend), 1);
  const bw = 400 / shop.months.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-condensed text-light">The fleet</h2>
        <span className="text-xs text-muted-text">your rig — how hard it runs, how thirsty it is, what it needs</span>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <Tile label="Utilization" value={util != null ? pct(util) : "—"}
          sub={metrics ? `truck under a load · ${metrics.idleDays} idle days` : "no loads yet"}
          color={util != null && util >= 0.8 ? "#4ade80" : undefined} />
        <Tile label="Home time"
          value={home.state === "none" ? "—" : home.daysOut === 0 ? "home today" : `${home.daysOut} days out`}
          sub={home.state === "none" ? "no home marks yet" : home.state === "over" ? `past your ${home.threshold}-day target` : `${home.toTarget} left to your ${home.threshold}-day target`}
          color={home.state === "over" ? "#f5a623" : undefined} warn={home.state === "over"} />
        <Tile label="Fuel economy" value={metrics?.avgMpg != null ? `${metrics.avgMpg.toFixed(1)} mpg` : "—"}
          sub={metrics?.bestTank != null ? `best tank ${metrics.bestTank.toFixed(1)}` : "log a full tank"} />
        <Tile label="Next service"
          value={counts.overdue > 0 ? `${counts.overdue} overdue` : nextSoon ? "due soon" : counts.ok > 0 ? "all good" : "—"}
          sub={nextSoon ? `${nextSoon.name} ${remain(nextSoon.due)}` : counts.overdue > 0 ? "see road-ready" : "nothing due"}
          color={counts.overdue > 0 ? "#f5a623" : counts.soon > 0 ? "#f5a623" : undefined} warn={counts.overdue > 0} />
      </div>

      {/* the rig + road-ready */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-3 items-start">
        <div className="rounded-xl p-3.5 relative overflow-hidden" style={C}>
          <div className="absolute top-0 right-0 w-24 h-24 pointer-events-none" style={{ backgroundImage: "radial-gradient(#e8940a 1.1px,transparent 1.2px)", backgroundSize: "8px 8px", opacity: 0.06 }} />
          <H3 right={<span className="normal-case tracking-normal font-normal">under-load · home · idle, {metrics?.windowDays ?? 0}d</span>}>The rig</H3>
          <p className="text-[13px] font-bold">{rigName} <span className="text-muted-text font-normal text-[11.5px]">· #{truck.unit_number} · {Number(truck.current_odometer).toLocaleString()} mi</span></p>
          {trailerName && <p className="text-[11px] text-muted-text mt-0.5">pulling a {trailerName} {trailer?.trailer_type} · #{trailer?.unit_number}</p>}

          <div className="flex h-[22px] rounded-md overflow-hidden my-2.5" style={{ border: "1px solid #26304a" }}>
            {uUL > 0 && <div className="flex items-center justify-center text-[9.5px] font-bold" style={{ width: `${uUL}%`, background: "#2f7d55", color: "#0d1119" }}>{util != null ? pct(util) : ""} rolling</div>}
            {uHome > 0 && <div style={{ width: `${uHome}%`, background: "#3a5170" }} />}
            {uIdle > 0 && <div style={{ width: `${uIdle}%`, background: "#8a5a1a" }} />}
          </div>
          <div className="flex gap-3.5 text-[10px] text-muted-text">
            <span><i className="inline-block w-2 h-2 rounded-sm mr-1 align-[-1px]" style={{ background: "#2f7d55" }} />{metrics?.underLoadDays ?? 0} under load</span>
            <span><i className="inline-block w-2 h-2 rounded-sm mr-1 align-[-1px]" style={{ background: "#3a5170" }} />{metrics?.homeDays ?? 0} home</span>
            <span><i className="inline-block w-2 h-2 rounded-sm mr-1 align-[-1px]" style={{ background: "#8a5a1a" }} />{metrics?.idleDays ?? 0} idle</span>
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
                <polyline fill="none" stroke="#5fd0e0" strokeWidth={2} points={mpgPts} />
                {mpgSeries.map((_, i) => {
                  const [x, y] = mpgPts.split(" ")[i].split(",");
                  return <circle key={i} cx={x} cy={y} r={i === mpgSeries.length - 1 ? 3 : 2.5} fill={i === mpgSeries.length - 1 ? "#4ade80" : "#5fd0e0"} />;
                })}
              </svg>
            </div>
          )}
          <Link to={`/trucks/${truck.truck_id}`} className="text-[11px] text-status-info-text hover:underline mt-2 inline-block">Truck details →</Link>
        </div>

        {/* road-ready */}
        <div className="rounded-xl p-3.5" style={C}>
          <H3 right={<span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full" style={{ color: health.color, background: "#1c1408", border: `1px solid ${health.color}55` }}>{health.label}</span>}>Road-ready</H3>
          {dues.length === 0 ? (
            <p className="text-xs text-muted-text">No maintenance schedule yet.</p>
          ) : (
            dues.slice(0, 4).map((d) => (
              <div key={d.name} className="flex items-center gap-2 py-1.5 text-[12px] border-t first:border-t-0" style={{ borderColor: "#1a2233" }}>
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
                {chips.map((c) => (
                  <span key={c.label} className={`text-[10px] font-semibold px-2 py-0.5 rounded ${COMP[c.level].cls}`} style={{ background: "#0e1420", border: "1px solid #26304a" }}>
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
        <div className="rounded-xl p-3.5" style={C}>
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
                <line x1="0" y1="76" x2="400" y2="76" stroke="#1c2536" />
                {shop.months.map((m, i) => {
                  const h = m.spend > 0 ? Math.max(3, (m.spend / smax) * 68) : 2;
                  const x = i * bw + 5, w = bw - 10, big = m.spend === smax && m.spend > 0;
                  return (
                    <g key={m.month}>
                      <rect x={x} y={76 - h} width={w} height={h} rx={2} fill={big ? "#f5b03a" : m.spend > 0 ? "#c8890a" : "#2a3347"} />
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

        <div className="rounded-xl p-3.5" style={C}>
          <H3 right={<span className="normal-case tracking-normal font-normal">per mile</span>}>Cost to run</H3>
          {costPerMile == null ? (
            <p className="text-xs text-muted-text">Not enough miles + fuel logged yet.</p>
          ) : (
            <>
              <div className="flex h-6 rounded-md overflow-hidden mb-2" style={{ border: "1px solid #26304a" }}>
                {fuelPct != null && <div className="flex items-center justify-center text-[10px] font-bold" style={{ width: `${fuelPct}%`, background: "#c8890a", color: "#0d1119" }}>Fuel {fuelPct}%</div>}
                {fuelPct != null && <div className="flex items-center justify-center text-[10px] font-bold" style={{ width: `${100 - fuelPct}%`, background: "#5f7fd0", color: "#0d1119" }}>Maint {100 - fuelPct}%</div>}
              </div>
              <div className="flex justify-between text-[11.5px] py-0.5"><span><b style={{ color: "#c8890a" }}>{rpm(fuelPerMile)}</b> fuel / mi</span></div>
              <div className="flex justify-between text-[11.5px] py-0.5"><span><b style={{ color: "#5f7fd0" }}>{rpm(maintPerMile)}</b> maintenance / mi</span><span className="text-muted-text">{fuelPct != null ? `${100 - fuelPct}% of the cost` : ""}</span></div>
              <div className="flex justify-between text-[11.5px] pt-1.5 mt-1 border-t" style={{ borderColor: "#1a2233" }}><span className="font-bold">{rpm(costPerMile)} total / mi</span><span className="text-muted-text">to keep her rolling</span></div>
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
      <div className="rounded-xl p-3.5" style={C}>
        <H3 right={<span className="normal-case tracking-normal font-normal">each column = one week (Sun→Sat) · oldest left → this week right</span>}>The year in days</H3>
        <div className="overflow-x-auto">
          <div style={{ width: heat.weeks * 13 }}>
            <div className="relative h-3.5 mb-1">
              {heat.months.map((m) => (
                <span key={m.col} className="absolute text-[9px] text-muted-text" style={{ left: m.col * 13 }}>{m.label}</span>
              ))}
            </div>
            <div className="grid gap-[3px]" style={{ gridTemplateRows: "repeat(7, 10px)", gridAutoFlow: "column", gridAutoColumns: "10px", width: heat.weeks * 13 }}>
              {heat.cells.map((c) => (
                <span key={c.date} title={`${c.date} · ${c.future ? "—" : c.status}`} className="w-2.5 h-2.5 rounded-sm"
                  style={{ background: c.future ? "transparent" : DAY_FILL[c.status] }} />
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-3.5 text-[10.5px] text-muted-text mt-2.5 flex-wrap">
          <span><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-[-1px]" style={{ background: "#2f7d55" }} />under a load (earning)</span>
          <span><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-[-1px]" style={{ background: "#3a5170" }} />home</span>
          <span><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-[-1px]" style={{ background: "#232c3d" }} />idle</span>
        </div>
      </div>
    </div>
  );
};
