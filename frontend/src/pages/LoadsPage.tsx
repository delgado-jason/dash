import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router";

import type { Load } from "@/types/load";
import { useLoads } from "@/hooks/useLoads";
import { useBrokers } from "@/hooks/useBrokers";
import { useAgents } from "@/hooks/useAgents";
import { useMarkets } from "@/hooks/useMarkets";
import { useFacilities } from "@/hooks/useFacilities";
import { StatusBadge } from "@/components/StatusBadge";
import { Kpi } from "@/components/Kpi";
import { Panel } from "@/components/ui/Panel";
import LoadForm from "../components/LoadForm";
import { createLoad } from "@/services/createLoadService";
import { loadsKpis, loadRevenue } from "@/lib/metrics/loads";
import { fmtRpm, rpmTextClass } from "@/components/lanes/rpmStyle";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import {
  loadFlag,
  detentionOwed,
  detentionEligible,
  detentionCollected,
  type LoadFlag,
} from "@/lib/detention";

const money = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

// Date-only, UTC-safe (Postgres dates would otherwise shift a day in local tz).
const fmtDate = (d: string) =>
  new Date(String(d).slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

// "In transit" is gone from the pills — those loads live in the pinned "On the
// road" group, so filtering by it would be redundant. Detention is derived
// (owed & unpaid), not a load_status.
const STATUS_FILTERS: [string, string][] = [
  ["all", "All"],
  ["booked", "Booked"],
  ["delivered", "Delivered"],
  ["tonu", "TONU"],
  ["detention", "Detention"],
];

const plural = (n: number) => (n !== 1 ? "s" : "");

// Traffic-light colors for the row's left bar (all three) + row tint (the two
// "money owed" states).
// Confirmed money-owed states get a colored bar; a detention *candidate* stays
// subtle (just the "det?" chip, no bar/tint) so the table isn't a wall of amber.
const BAR: Partial<Record<LoadFlag, string>> = {
  tonu: "#e24b4a",
  detention: "#e8940a",
  "in-transit": "#3fb950",
};
const TINT: Partial<Record<LoadFlag, string>> = {
  tonu: "rgba(226,75,74,0.10)",
  detention: "rgba(232,148,10,0.10)",
};

const Chip = ({ bg, fg, text }: { bg: string; fg: string; text: string }) => (
  <span
    className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full align-middle"
    style={{ background: bg, color: fg }}
  >
    {text}
  </span>
);

// One loads-table row, shared by the "On the road" group and the main table.
const LoadRow = ({ load, freeHours }: { load: Load; freeHours: number }) => {
  const flag = loadFlag(load, freeHours);
  const detPaid = detentionCollected(load);
  const tonuPaid = load.load_status === "tonu" && load.tonu_paid;
  return (
    <tr
      className="border-t border-steel align-top"
      style={flag && TINT[flag] ? { background: TINT[flag] } : undefined}
    >
      <td
        className="py-2 whitespace-nowrap"
        style={
          flag && BAR[flag]
            ? { borderLeft: `3px solid ${BAR[flag]}`, paddingLeft: 8 }
            : undefined
        }
      >
        <Link
          to={`/loads/${load.load_id}`}
          className="text-amber-light hover:underline font-medium"
        >
          {load.load_number}
        </Link>
        {flag === "detention" && <Chip bg="#7a4718" fg="#f5c37a" text="DET" />}
        {flag === "detention-eligible" && (
          <Chip bg="transparent" fg="#8b98a9" text="det?" />
        )}
        {detPaid && <Chip bg="#12251a" fg="#6f9a80" text="det paid" />}
        {tonuPaid && <Chip bg="#12251a" fg="#6f9a80" text="tonu paid" />}
      </td>
      <td className="py-2">
        <StatusBadge value={load.load_status} />
      </td>
      <td className="py-2">
        {load.broker}
        <span className="text-xs block">
          <Link
            to={`/agents/${load.agent_id}`}
            className="text-muted-text hover:text-amber-light hover:underline"
          >
            {load.agent}
          </Link>
        </span>
      </td>
      <td className="py-2 whitespace-nowrap">
        {load.origin_city}, {load.origin_state}
        <span className="text-muted-text"> → </span>
        {load.destination_city}, {load.destination_state}
      </td>
      <td className="py-2 text-muted-text whitespace-nowrap">
        {fmtDate(load.pickup_date)}
      </td>
      <td className="py-2 text-right whitespace-nowrap">
        {money(loadRevenue(load))}
      </td>
      <td className="py-2">
        <StatusBadge value={load.payment_status} />
      </td>
    </tr>
  );
};

const LoadsPage = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [brokerRefreshKey, setBrokerRefreshKey] = useState(0);
  const [agentRefreshKey, setAgentRefreshKey] = useState(0);
  const [marketRefreshKey, setMarketRefreshKey] = useState(0);
  const [facilityRefreshKey, setFacilityRefreshKey] = useState(0);

  const { brokers } = useBrokers(brokerRefreshKey);
  const { loads, isLoading, error } = useLoads(refreshKey);
  const { agents } = useAgents(agentRefreshKey);
  const { markets } = useMarkets(marketRefreshKey);
  const { facilities } = useFacilities(facilityRefreshKey);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [freeHours, setFreeHours] = useState(3);

  useEffect(() => {
    getSettlementSchedule()
      .then((s) => setFreeHours(s.detention_free_hours))
      .catch(() => {});
  }, []);

  // KPIs describe the whole business, so they ignore the table filters.
  const kpis = useMemo(() => loadsKpis(loads ?? [], new Date()), [loads]);

  // In-transit loads lift into their own pinned group; the status pill filters
  // only the main table below. The search box + payment filter narrow both.
  const { inTransit, rest } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const searchPayMatch = (l: Load) => {
      if (paymentFilter !== "all" && l.payment_status !== paymentFilter)
        return false;
      if (!q) return true;
      return [
        l.load_number,
        l.broker,
        l.agent,
        l.origin_city,
        l.origin_state,
        l.destination_city,
        l.destination_state,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    };
    const statusMatch = (l: Load) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "tonu") return l.load_status === "tonu";
      if (statusFilter === "detention")
        return detentionOwed(l) || detentionEligible(l, freeHours);
      return l.load_status === statusFilter;
    };
    const base = loads ?? [];
    return {
      inTransit: base.filter(
        (l) => searchPayMatch(l) && l.load_status === "in_transit",
      ),
      rest: base.filter(
        (l) =>
          searchPayMatch(l) && statusMatch(l) && l.load_status !== "in_transit",
      ),
    };
  }, [loads, search, statusFilter, paymentFilter, freeHours]);

  if (isLoading)
    return (
      <div className="p-6 bg-iron text-light min-h-screen">
        <p className="text-muted-text">Loading loads...</p>
      </div>
    );

  if (error)
    return (
      <div className="p-6 bg-iron text-light min-h-screen">
        <p className="text-destructive">{error}</p>
      </div>
    );

  const pipeline = kpis.bookedCount + kpis.inTransitCount;

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowCreateForm(false)}
          />
          <div className="relative w-full max-w-[750px] mx-4 max-h-[90vh] bg-iron text-light overflow-y-auto shadow-xl rounded-lg p-4 sm:p-6 border border-plate">
            <LoadForm
              mode="create"
              brokers={brokers}
              agents={agents}
              markets={markets}
              facilities={facilities}
              onSubmit={async (data) => {
                await createLoad(data);
              }}
              onSuccess={() => setRefreshKey((p) => p + 1)}
              onBrokerCreated={() => setBrokerRefreshKey((p) => p + 1)}
              onAgentCreated={() => setAgentRefreshKey((p) => p + 1)}
              onMarketCreated={() => setMarketRefreshKey((p) => p + 1)}
              onFacilityCreated={() => setFacilityRefreshKey((p) => p + 1)}
              onClose={() => setShowCreateForm(false)}
            />
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-condensed text-light">Loads</h1>
        <button
          className="bg-amber text-steel px-3 py-2 rounded-lg text-sm font-semibold"
          onClick={() => setShowCreateForm(true)}
        >
          + Create load
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi
          label="This month · net"
          value={money(kpis.deliveredNet)}
          sub={`${kpis.deliveredCount} load${plural(kpis.deliveredCount)} delivered`}
        />
        <Kpi
          label="Avg rate / mile"
          value={fmtRpm(kpis.rpm)}
          valueClass={rpmTextClass(kpis.rpm)}
          sub={`this month · ${kpis.loadedMiles.toLocaleString("en-US")} mi`}
        />
        <Kpi
          label="Outstanding AR"
          value={money(kpis.arTotal)}
          sub={`${kpis.arCount} load${plural(kpis.arCount)} · unpaid + invoiced`}
        />
        <Kpi
          label="Pipeline"
          value={`${pipeline} load${plural(pipeline)}`}
          sub={`${kpis.bookedCount} booked · ${kpis.inTransitCount} in transit`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-plate rounded-lg p-3 mt-4">
        <input
          className="bg-steel rounded px-3 py-1.5 text-sm flex-1 min-w-[180px] text-light placeholder:text-muted-text"
          placeholder="Search load #, broker, city"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-1 bg-steel rounded-lg p-1">
          {STATUS_FILTERS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`px-2.5 py-1 rounded text-sm ${
                statusFilter === key
                  ? "bg-amber text-steel font-semibold"
                  : "text-muted-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          className="bg-steel rounded px-2 py-1.5 text-sm text-light"
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
        >
          <option value="all">All payments</option>
          <option value="unpaid">Unpaid</option>
          <option value="invoiced">Invoiced</option>
          <option value="paid">Paid</option>
        </select>
      </div>

      {inTransit.length > 0 && (
        <div
          className="border rounded-xl overflow-hidden mt-4"
          style={{ borderColor: "#1f4d33" }}
        >
          <div
            className="px-3 py-2 flex items-center gap-2"
            style={{
              background: "rgba(63,185,80,0.12)",
              borderBottom: "1px solid #1f4d33",
            }}
          >
            <span className="text-base">🚚</span>
            <span
              className="font-condensed text-lg"
              style={{ color: "#6fd08c" }}
            >
              On the road
            </span>
            <span
              className="text-[11px] px-2 py-0.5 rounded-full"
              style={{ background: "#12251a", color: "#6fd08c" }}
            >
              {inTransit.length}
            </span>
            <span className="text-[11px] text-muted-text ml-auto">
              what's rolling now
            </span>
          </div>
          <div className="overflow-x-auto" style={{ background: "#12180f" }}>
            <table className="w-full text-sm min-w-[760px] px-2 [&_td]:pr-5 [&_td:last-child]:pr-0 [&_td:first-child]:pl-3">
              <tbody>
                {inTransit.map((load) => (
                  <LoadRow
                    key={load.load_id}
                    load={load}
                    freeHours={freeHours}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Panel className="p-4 mt-4 overflow-x-auto">
        {rest.length === 0 ? (
          <p className="text-muted-text text-sm">
            {(loads ?? []).length === 0
              ? "No loads yet."
              : inTransit.length > 0
                ? "No other loads match these filters."
                : "No loads match these filters."}
          </p>
        ) : (
          <table className="w-full text-sm min-w-[760px] [&_th]:pr-5 [&_td]:pr-5 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0">
            <thead>
              <tr className="text-xs text-muted-text text-left">
                <th className="font-normal pb-2">Load #</th>
                <th className="font-normal pb-2">Status</th>
                <th className="font-normal pb-2">Broker · agent</th>
                <th className="font-normal pb-2">Lane</th>
                <th className="font-normal pb-2">Pickup</th>
                <th className="font-normal pb-2 text-right">Gross</th>
                <th className="font-normal pb-2">Payment</th>
              </tr>
            </thead>
            <tbody>
              {rest.map((load) => (
                <LoadRow key={load.load_id} load={load} freeHours={freeHours} />
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
};

export default LoadsPage;
