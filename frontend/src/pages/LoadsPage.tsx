import { useState, useMemo } from "react";
import { Link } from "react-router";

import { useLoads } from "@/hooks/useLoads";
import { useBrokers } from "@/hooks/useBrokers";
import { useAgents } from "@/hooks/useAgents";
import { useMarkets } from "@/hooks/useMarkets";
import { useFacilities } from "@/hooks/useFacilities";
import { StatusBadge } from "@/components/StatusBadge";
import { Kpi } from "@/components/Kpi";
import LoadForm from "../components/LoadForm";
import { createLoad } from "@/services/createLoadService";
import { loadsKpis, loadRevenue } from "@/lib/metrics/loads";
import { fmtRpm, rpmTextClass } from "@/components/lanes/rpmStyle";

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

const STATUS_FILTERS: [string, string][] = [
  ["all", "All"],
  ["booked", "Booked"],
  ["in_transit", "In transit"],
  ["delivered", "Delivered"],
];

const plural = (n: number) => (n !== 1 ? "s" : "");

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

  // KPIs describe the whole business, so they ignore the table filters.
  const kpis = useMemo(() => loadsKpis(loads ?? [], new Date()), [loads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (loads ?? []).filter((l) => {
      if (statusFilter !== "all" && l.load_status !== statusFilter) return false;
      if (paymentFilter !== "all" && l.payment_status !== paymentFilter)
        return false;
      if (!q) return true;
      const hay = [
        l.load_number,
        l.broker,
        l.agent,
        l.origin_city,
        l.origin_state,
        l.destination_city,
        l.destination_state,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [loads, search, statusFilter, paymentFilter]);

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

      <div className="bg-plate rounded-lg p-4 mt-4 overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="text-muted-text text-sm">
            {loads.length === 0
              ? "No loads yet."
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
              {filtered.map((load) => (
                <tr
                  key={load.load_id}
                  className="border-t border-steel align-top"
                >
                  <td
                    className={`py-2 whitespace-nowrap ${
                      load.load_status === "in_transit"
                        ? "border-l-2 border-l-amber pl-2"
                        : ""
                    }`}
                  >
                    <Link
                      to={`/loads/${load.load_id}`}
                      className="text-amber-light hover:underline font-medium"
                    >
                      {load.load_number}
                    </Link>
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
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default LoadsPage;
