import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Pencil, Trash2, Truck, User, Container, Clock, Ban } from "lucide-react";

import { useLoad } from "@/hooks/useLoad";
import { formatLoadDims } from "@/lib/dimensions";
import { useAccessorials } from "@/hooks/useAccessorials";
import { useBrokers } from "@/hooks/useBrokers";
import { useAgents } from "@/hooks/useAgents";
import { useMarkets } from "@/hooks/useMarkets";
import { useFacilities } from "@/hooks/useFacilities";

import { patchLoad } from "@/services/patchLoadService";
import { createAccessorial } from "@/services/createAccessorialService";
import { deleteAccessorial } from "@/services/deleteAccessorialService";
import { patchAccessorial } from "@/services/patchAccessorialService";
import { deleteLoad } from "@/services/deleteLoadService";
import { getAccessorialRates } from "@/services/accessorialRateService";

import LoadForm from "@/components/LoadForm";
import { StatusBadge } from "@/components/StatusBadge";
import { RubberStamp, loadStamp } from "@/components/comic/RubberStamp";
import { Kpi } from "@/components/Kpi";
import { fmtTime, dwell } from "@/lib/stopTimes";
import {
  onTimeStatus,
  type OnTime,
  detentionOwed,
  detentionMinutes,
  detentionLabel,
  tonuOwed,
} from "@/lib/detention";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/Panel";

import { loadRevenue, loadRpm, deadheadShare } from "@/lib/metrics/loads";
import {
  estimateLoadFuel,
  ASSUMED_MPG,
  ASSUMED_FUEL_PRICE,
} from "@/lib/metrics/fuel";
import { fuelStats } from "@/lib/metrics/fuelEconomy";
import { getFuelEntries } from "@/services/fuelService";
import type { FuelEntry } from "@/types/fuelEntry";
import { fmtRpm, rpmTextClass } from "@/components/lanes/rpmStyle";

const money0 = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
const money2 = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const fmtDate = (d?: string | null) =>
  d
    ? new Date(String(d).slice(0, 10) + "T00:00:00Z").toLocaleDateString(
        "en-US",
        { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" },
      )
    : "Not set";

const cardLbl = "text-xs text-muted-text uppercase tracking-wider mb-2";

const Row = ({ label, value }: { label: ReactNode; value: ReactNode }) => (
  <div className="flex justify-between gap-3 py-0.5 text-sm">
    <span className="text-muted-text">{label}</span>
    <span className="text-right">{value}</span>
  </div>
);

// Scheduled appointment (no end) or window (start–end), for the stop cards.
const schedLabel = (start?: string | null, end?: string | null): string | null => {
  if (!start) return null;
  return end ? `Window ${fmtTime(start)}–${fmtTime(end)}` : `Appt ${fmtTime(start)}`;
};

const ONTIME_STYLE: Record<OnTime, { bg: string; fg: string; label: string }> = {
  "on-time": { bg: "#0f2419", fg: "#8fd6a8", label: "On time" },
  late: { bg: "#3a1417", fg: "#f2a6a3", label: "Late" },
  waited: { bg: "#2a1e0e", fg: "#f5c37a", label: "Waited" },
};

const OnTimeBadge = ({ status }: { status: OnTime | null }) => {
  if (!status) return null;
  const s = ONTIME_STYLE[status];
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
};

// The in → out time line for one stop, with a dwell chip when both are set.
const StopTimes = ({
  inTime,
  outTime,
}: {
  inTime?: string | null;
  outTime?: string | null;
}) => {
  const d = dwell(inTime, outTime);
  return (
    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-iron">
      <span className="text-xs text-muted-text">In</span>
      <span className="text-sm">{fmtTime(inTime)}</span>
      <span className="text-muted-text">→</span>
      <span className="text-xs text-muted-text">Out</span>
      <span className="text-sm">{fmtTime(outTime)}</span>
      {d && (
        <span
          className="ml-auto text-[11px] px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: "var(--color-status-positive-bg)",
            color: "var(--color-status-positive-text)",
          }}
        >
          {d}
        </span>
      )}
    </div>
  );
};

const LOAD_STATUSES = ["booked", "in_transit", "delivered", "cancelled", "tonu"];
const PAYMENT_STATUSES = ["unpaid", "invoiced", "paid", "cancelled"];

export const LoadDetailPage = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [accRefreshKey, setAccRefreshKey] = useState(0);
  const { load, isLoading, error } = useLoad(refreshKey);
  const { accessorials } = useAccessorials(accRefreshKey);

  const [newType, setNewType] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [accTypes, setAccTypes] = useState<string[]>([]);
  const [otherMode, setOtherMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusSel, setStatusSel] = useState("");
  const [paymentSel, setPaymentSel] = useState("");

  const [editingId, setEditingId] = useState("");
  const [editingType, setEditingType] = useState("");
  const [editingAmount, setEditingAmount] = useState<number>(0);

  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { brokers } = useBrokers(0);
  const { agents } = useAgents(0);
  const { markets } = useMarkets(0);
  const { facilities } = useFacilities(0);
  const [freeHours, setFreeHours] = useState(3);
  const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([]);

  useEffect(() => {
    getSettlementSchedule()
      .then((s) => setFreeHours(s.detention_free_hours))
      .catch(() => {});
    getFuelEntries()
      .then(setFuelEntries)
      .catch(() => {});
  }, []);

  // Mark a detention/TONU fee collected — clears the owed flag + row highlight.
  const markPaid = async (field: "detention_paid" | "tonu_paid") => {
    if (!load) return;
    try {
      await patchLoad(load.load_id, { [field]: true });
      setRefreshKey((p) => p + 1);
    } catch {
      /* surfaced by the normal error path on next load */
    }
  };

  const navigate = useNavigate();

  useEffect(() => {
    if (load) {
      setStatusSel(load.load_status);
      setPaymentSel(load.payment_status);
    }
  }, [load]);

  useEffect(() => {
    getAccessorialRates()
      .then((rs) => setAccTypes(rs.map((r) => r.accessorial_type)))
      .catch(() => {});
  }, []);

  if (isLoading)
    return (
      <div className="p-6 bg-iron text-light min-h-screen font-body">
        <p className="text-muted-text">Loading…</p>
      </div>
    );
  if (error)
    return (
      <div className="p-6 bg-iron text-light min-h-screen font-body">
        <p className="text-destructive">{error}</p>
      </div>
    );
  if (!load) return null;

  const capitalize = (str: string) =>
    str
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

  const revenue = loadRevenue(load);
  // What the company actually keeps after the carrier's cut. Falls back to the
  // full rate for own-authority users (no settlement schedule → net == gross).
  const net = Number.isFinite(Number(load.net_revenue))
    ? Number(load.net_revenue)
    : revenue;
  const rpm = loadRpm(load);
  const dh = deadheadShare(load);
  // Use the truck's real MPG + price/gal from fuel history; fall back to the
  // working assumptions only until there's fuel data logged.
  const fs = fuelStats(fuelEntries, new Date());
  const fuelMpg = fs.avgMpg ?? ASSUMED_MPG;
  const fuelPrice = fs.avgCostPerGallon ?? ASSUMED_FUEL_PRICE;
  const usingRealFuel = fs.avgMpg != null && fs.avgCostPerGallon != null;
  const fuel = estimateLoadFuel(load, fuelMpg, fuelPrice);
  const accTotal = accessorials.reduce((s, a) => s + Number(a.amount), 0);

  const handleSaveChanges = async () => {
    if (statusSel === load.load_status && paymentSel === load.payment_status)
      return;
    try {
      setIsSaving(true);
      await patchLoad(load.load_id, {
        load_status: statusSel,
        payment_status: paymentSel,
      });
      setRefreshKey((p) => p + 1);
    } catch {
      // surfaced by the row's own state; nothing to do here
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddAccessorial = async () => {
    if (!newType.trim() || newAmount.trim() === "") return;
    try {
      await createAccessorial(load.load_id, {
        accessorial_type: capitalize(newType.trim()),
        amount: Number(newAmount),
      });
      setAccRefreshKey((p) => p + 1);
      setRefreshKey((p) => p + 1);
    } finally {
      setNewType("");
      setNewAmount("");
      setOtherMode(false);
    }
  };

  const handleDeleteAccessorial = async (id: string) => {
    await deleteAccessorial(id);
    setAccRefreshKey((p) => p + 1);
    setRefreshKey((p) => p + 1);
  };

  const startEdit = (id: string, type: string, amount: number) => {
    setEditingId(id);
    setEditingType(type);
    setEditingAmount(amount);
  };

  const handleSaveEdit = async () => {
    try {
      await patchAccessorial(editingId, {
        accessorial_type: editingType,
        amount: editingAmount,
      });
      setAccRefreshKey((p) => p + 1);
      setRefreshKey((p) => p + 1);
    } finally {
      setEditingId("");
    }
  };

  const handleDeleteLoad = async () => {
    try {
      await deleteLoad(load.load_id);
      navigate("/loads");
    } finally {
      setShowDeleteModal(false);
    }
  };

  const fleetChip = (n?: string | null) => (n ? n : "—");

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      {showEditForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowEditForm(false)}
          />
          <div className="relative w-full max-w-[750px] mx-4 max-h-[90vh] bg-iron text-light overflow-y-auto shadow-xl rounded-lg p-4 sm:p-6 border border-plate">
            <LoadForm
              mode="edit"
              initialData={{
                load_number: load.load_number,
                broker_id: load.broker_id,
                agent_id: load.agent_id,
                load_type: load.load_type,
                load_status: load.load_status,
                pickup_date: load.pickup_date.slice(0, 10),
                delivery_date: load.delivery_date?.slice(0, 10) ?? null,
                origin_city: load.origin_city,
                origin_state: load.origin_state,
                origin_market_id: load.origin_market_id,
                destination_city: load.destination_city,
                destination_state: load.destination_state,
                destination_market_id: load.destination_market_id,
                commodity: load.commodity,
                weight: load.weight ?? null,
                length_in: load.length_in ?? null,
                width_in: load.width_in ?? null,
                height_in: load.height_in ?? null,
                shipper_name: load.shipper_name ?? null,
                shipper_facility_id: load.shipper_facility_id ?? null,
                shipper_in: load.shipper_in ?? null,
                shipper_out: load.shipper_out ?? null,
                pickup_appt_start: load.pickup_appt_start ?? null,
                pickup_appt_end: load.pickup_appt_end ?? null,
                receiver_name: load.receiver_name ?? null,
                receiver_facility_id: load.receiver_facility_id ?? null,
                receiver_in: load.receiver_in ?? null,
                receiver_out: load.receiver_out ?? null,
                delivery_appt_start: load.delivery_appt_start ?? null,
                delivery_appt_end: load.delivery_appt_end ?? null,
                linehaul: Number(load.linehaul),
                fuel_surcharge: Number(load.fuel_surcharge),
                deadhead_miles: load.deadhead_miles,
                loaded_miles: load.loaded_miles,
                odometer_start: load.odometer_start ?? null,
                odometer_end: load.odometer_end ?? null,
                payment_status: load.payment_status,
                truck_id: load.truck_id ?? null,
                driver_id: load.driver_id ?? null,
                trailer_id: load.trailer_id ?? null,
              }}
              brokers={brokers}
              agents={agents}
              markets={markets}
              facilities={facilities}
              onSubmit={async (data) => {
                await patchLoad(load.load_id, data);
              }}
              onSuccess={() => setRefreshKey((p) => p + 1)}
              onBrokerCreated={() => {}}
              onAgentCreated={() => {}}
              onMarketCreated={() => {}}
              onClose={() => setShowEditForm(false)}
            />
          </div>
        </div>
      )}

      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete load</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {load.load_number}? This can't be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteLoad}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Link to="/loads" className="text-xs text-muted-text hover:text-light">
        ← Loads
      </Link>

      <div className="flex justify-between items-start mt-3 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-condensed">{load.load_number}</h1>
            <StatusBadge value={load.load_status} />
            <StatusBadge value={load.payment_status} />
            <RubberStamp value={loadStamp(load.load_status, load.payment_status)} />
          </div>
          <p className="text-muted-text text-sm mt-1">
            {load.broker} · {load.agent} · {capitalize(load.load_type)}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowEditForm(true)}
            className="bg-steel text-light px-3 py-1.5 rounded text-sm flex items-center gap-1"
          >
            <Pencil size={14} /> Edit
          </button>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="bg-steel text-destructive px-3 py-1.5 rounded text-sm flex items-center gap-1"
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>

      {tonuOwed(load) && (
        <div
          className="mb-4 rounded-lg p-4 flex items-center gap-3 flex-wrap"
          style={{ border: "1px solid #7a2f2e", background: "#241012" }}
        >
          <Ban size={20} style={{ color: "#f2a6a3" }} />
          <div className="flex-1 min-w-[180px]">
            <p className="font-condensed text-lg" style={{ color: "#f2a6a3" }}>
              TONU fee owed · {money0(revenue)}
            </p>
            <p className="text-[11px] text-muted-text">
              Truck ordered, not used. Collect the fee, then mark it.
            </p>
          </div>
          <button
            onClick={() => markPaid("tonu_paid")}
            className="text-xs px-3 py-1.5 rounded font-semibold"
            style={{ background: "#e24b4a", color: "#120f08" }}
          >
            Mark TONU paid
          </button>
        </div>
      )}
      {load.load_status === "tonu" && load.tonu_paid && (
        <div
          className="mb-4 rounded-lg px-4 py-2 text-sm"
          style={{ background: "#12180f", color: "#6f9a80" }}
        >
          TONU fee paid ✓
        </div>
      )}
      {detentionOwed(load, freeHours) && (
        <div
          className="mb-4 rounded-lg p-4 flex items-center gap-3 flex-wrap"
          style={{ border: "1px solid #7a4718", background: "#241a0e" }}
        >
          <Clock size={20} style={{ color: "#f5b03a" }} />
          <div className="flex-1 min-w-[180px]">
            <p className="font-condensed text-lg" style={{ color: "#f5b03a" }}>
              Detention owed · {detentionLabel(load, freeHours)}
            </p>
            <p className="text-[11px] text-muted-text">
              Past your {freeHours}h free at a stop. Bill it as an accessorial.
            </p>
          </div>
          <button
            onClick={() => markPaid("detention_paid")}
            className="text-xs px-3 py-1.5 rounded font-semibold"
            style={{ background: "#e8940a", color: "#161008" }}
          >
            Mark detention paid
          </button>
        </div>
      )}
      {load.detention_paid && detentionMinutes(load, freeHours) > 0 && (
        <div
          className="mb-4 rounded-lg px-4 py-2 text-sm"
          style={{ background: "#12180f", color: "#6f9a80" }}
        >
          Detention paid ✓
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Total revenue" value={money0(revenue)} />
        <Kpi
          label="Rate / mile"
          value={fmtRpm(rpm)}
          valueClass={rpmTextClass(rpm)}
          sub={`${(Number(load.loaded_miles) || 0).toLocaleString("en-US")} loaded mi`}
        />
        <Kpi
          label="Loaded miles"
          value={(Number(load.loaded_miles) || 0).toLocaleString("en-US")}
        />
        <Kpi
          label="Deadhead"
          value={dh == null ? "—" : `${Math.round(dh * 100)}%`}
          sub={`${(Number(load.deadhead_miles) || 0).toLocaleString("en-US")} mi`}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <Panel className="p-4">
          <p className={cardLbl}>Route</p>
          <div className="flex gap-3">
            <div className="flex flex-col items-center pt-1.5">
              <div className="w-2 h-2 rounded-full bg-muted-text" />
              <div className="w-px flex-1 bg-steel min-h-[24px] my-1" />
              <div className="w-2 h-2 rounded-full bg-amber" />
            </div>
            <div className="text-sm flex-1">
              <p className="font-medium">
                {load.origin_city}, {load.origin_state}
              </p>
              <p className="text-xs text-muted-text mb-3">
                {load.origin_market}
              </p>
              <p className="font-medium">
                {load.destination_city}, {load.destination_state}
              </p>
              <p className="text-xs text-muted-text">{load.delivery_market}</p>
            </div>
          </div>
        </Panel>

        <Panel className="p-4 border border-amber">
          <p className={`${cardLbl} text-amber-light`}>Fleet</p>
          <Row
            label={
              <span className="flex items-center gap-1.5">
                <Truck size={15} /> Truck
              </span>
            }
            value={
              load.truck_id ? (
                <Link
                  to={`/trucks/${load.truck_id}`}
                  className="text-amber-light hover:underline"
                >
                  Unit {fleetChip(load.truck_unit)}
                </Link>
              ) : (
                "—"
              )
            }
          />
          <Row
            label={
              <span className="flex items-center gap-1.5">
                <User size={15} /> Driver
              </span>
            }
            value={
              load.driver_id ? (
                <Link
                  to={`/drivers/${load.driver_id}`}
                  className="text-amber-light hover:underline"
                >
                  {fleetChip(load.driver_name)}
                </Link>
              ) : (
                "—"
              )
            }
          />
          <Row
            label={
              <span className="flex items-center gap-1.5">
                <Container size={15} /> Trailer
              </span>
            }
            value={
              load.trailer_id ? (
                <Link
                  to={`/trailers/${load.trailer_id}`}
                  className="text-amber-light hover:underline"
                >
                  Unit {fleetChip(load.trailer_unit)}
                </Link>
              ) : (
                "—"
              )
            }
          />
        </Panel>

        <Panel className="p-4">
          <p className={cardLbl}>Revenue</p>
          <Row label="Linehaul" value={money2(Number(load.linehaul))} />
          <Row
            label="Fuel surcharge"
            value={money2(Number(load.fuel_surcharge))}
          />
          <Row
            label="Accessorials"
            value={money2(Number(load.total_accessorials))}
          />
          <div className="flex justify-between border-t border-steel mt-1.5 pt-1.5 text-sm">
            <span>Total rate</span>
            <span className="font-condensed text-base">{money2(revenue)}</span>
          </div>
          {Math.abs(net - revenue) > 0.005 && (
            <>
              <div className="flex justify-between mt-1 text-sm">
                <span className="text-status-positive-text">Your net</span>
                <span className="font-condensed text-base text-status-positive-text">
                  {money2(net)}
                </span>
              </div>
              <p className="text-[11px] text-muted-text mt-1">
                After your carrier's cut — what your company keeps.
              </p>
            </>
          )}
        </Panel>

        <Panel className="p-4">
          <p className={cardLbl}>Mileage</p>
          <Row
            label="Loaded"
            value={`${(Number(load.loaded_miles) || 0).toLocaleString("en-US")} mi`}
          />
          <Row
            label="Deadhead"
            value={`${(Number(load.deadhead_miles) || 0).toLocaleString("en-US")} mi`}
          />
          <Row
            label="Odometer"
            value={
              load.odometer_start && load.odometer_end
                ? `${load.odometer_start.toLocaleString("en-US")} → ${load.odometer_end.toLocaleString("en-US")}`
                : "Not recorded"
            }
          />
        </Panel>

        <Panel className="p-4">
          <p className={cardLbl}>Cargo</p>
          <Row label="Commodity" value={load.commodity || "—"} />
          <Row
            label="Weight"
            value={load.weight ? `${load.weight.toLocaleString("en-US")} lb` : "—"}
          />
          <Row
            label="Dimensions"
            value={
              formatLoadDims(load.length_in, load.width_in, load.height_in) ||
              "Legal"
            }
          />
        </Panel>

        <Panel className="p-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className={`${cardLbl} mb-0`}>Shipper</p>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-text">
                Pickup · {fmtDate(load.pickup_date)}
              </span>
              <OnTimeBadge
                status={onTimeStatus(
                  load.pickup_appt_start,
                  load.pickup_appt_end,
                  load.shipper_in,
                )}
              />
            </div>
          </div>
          <p className="text-base font-condensed mt-1">
            {load.shipper_facility_id ? (
              <Link
                to={`/facilities/${load.shipper_facility_id}`}
                className="text-amber-light hover:underline"
              >
                {load.shipper_name || "—"}
              </Link>
            ) : (
              load.shipper_name || "—"
            )}
          </p>
          <p className="text-xs text-muted-text">
            {load.origin_city}, {load.origin_state}
          </p>
          {schedLabel(load.pickup_appt_start, load.pickup_appt_end) && (
            <p className="text-[11px] text-muted-text mt-1">
              Scheduled · {schedLabel(load.pickup_appt_start, load.pickup_appt_end)}
            </p>
          )}
          <StopTimes inTime={load.shipper_in} outTime={load.shipper_out} />
        </Panel>

        <Panel className="p-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className={`${cardLbl} mb-0`}>Receiver</p>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-text">
                Delivery · {fmtDate(load.delivery_date)}
              </span>
              <OnTimeBadge
                status={onTimeStatus(
                  load.delivery_appt_start,
                  load.delivery_appt_end,
                  load.receiver_in,
                )}
              />
            </div>
          </div>
          <p className="text-base font-condensed mt-1">
            {load.receiver_facility_id ? (
              <Link
                to={`/facilities/${load.receiver_facility_id}`}
                className="text-amber-light hover:underline"
              >
                {load.receiver_name || "—"}
              </Link>
            ) : (
              load.receiver_name || "—"
            )}
          </p>
          <p className="text-xs text-muted-text">
            {load.destination_city}, {load.destination_state}
          </p>
          {schedLabel(load.delivery_appt_start, load.delivery_appt_end) && (
            <p className="text-[11px] text-muted-text mt-1">
              Scheduled ·{" "}
              {schedLabel(load.delivery_appt_start, load.delivery_appt_end)}
            </p>
          )}
          <StopTimes inTime={load.receiver_in} outTime={load.receiver_out} />
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <p className={`${cardLbl} mb-0`}>Fuel</p>
            <span
              className="text-[11px] px-2 py-0.5 rounded"
              style={{
                backgroundColor:
                  fuel?.basis === "actual"
                    ? "var(--color-status-positive-bg)"
                    : "var(--color-status-aware-bg)",
                color:
                  fuel?.basis === "actual"
                    ? "var(--color-status-positive-text)"
                    : "var(--color-status-aware-text)",
              }}
            >
              {fuel?.basis === "actual" ? "actual" : "est."}
            </span>
          </div>
          {fuel ? (
            <>
              <Row label="Fuel cost" value={money2(fuel.cost)} />
              <Row
                label="Miles"
                value={`${fuel.miles.toLocaleString("en-US")} mi`}
              />
              <Row
                label="Gallons"
                value={`${Math.round(fuel.gallons).toLocaleString("en-US")} gal`}
              />
              <Row
                label={usingRealFuel ? "Your avg" : "Assumed"}
                value={`${fuelMpg.toFixed(1)} mpg · $${fuelPrice.toFixed(2)}/gal`}
              />
              <p className="text-xs text-muted-text mt-2">
                {fuel.basis === "actual"
                  ? "Miles from this load's odometer readings."
                  : "Miles estimated from loaded + deadhead — enter odometer start and end for actual."}{" "}
                {usingRealFuel
                  ? "MPG and price are your fuel-history averages."
                  : "MPG and price are working assumptions until you log fuel."}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-text">
              Add loaded miles to estimate fuel.
            </p>
          )}
        </Panel>

        <Panel className="p-4">
          <p className={cardLbl}>Broker · agent</p>
          <p className="text-sm">{load.broker}</p>
          <p className="text-sm text-muted-text">
            <Link
              to={`/agents/${load.agent_id}`}
              className="text-amber-light hover:underline"
            >
              {load.agent}
            </Link>
            {load.agent_email ? ` · ${load.agent_email}` : ""}
          </p>
        </Panel>

        <Panel className="p-4 md:col-span-2">
          <p className={cardLbl}>Update status</p>
          <div className="flex flex-wrap gap-2 items-center">
            <select
              className="bg-steel rounded px-2 py-1.5 text-sm flex-1 min-w-[140px] text-light"
              value={statusSel}
              onChange={(e) => setStatusSel(e.target.value)}
            >
              {LOAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {capitalize(s.replace("_", " "))}
                </option>
              ))}
            </select>
            <select
              className="bg-steel rounded px-2 py-1.5 text-sm flex-1 min-w-[140px] text-light"
              value={paymentSel}
              onChange={(e) => setPaymentSel(e.target.value)}
            >
              {PAYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {capitalize(s)}
                </option>
              ))}
            </select>
            <button
              disabled={isSaving}
              onClick={handleSaveChanges}
              className="bg-amber text-steel px-4 py-1.5 rounded text-sm font-semibold disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </Panel>
      </div>

      <Panel className="p-4 mt-4">
        <div className="flex justify-between items-center mb-2">
          <p className={`${cardLbl} mb-0`}>Accessorials</p>
          <span className="text-xs text-muted-text">
            Total {money2(accTotal)}
          </span>
        </div>

        {accessorials.length === 0 ? (
          <p className="text-sm text-muted-text">No accessorials logged.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-text text-left">
                <th className="font-normal pb-1">Type</th>
                <th className="font-normal pb-1 text-right">Amount</th>
                <th className="font-normal pb-1 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accessorials.map((a) => {
                const editing = editingId === a.accessorial_id;
                return (
                  <tr
                    key={a.accessorial_id}
                    className="border-t border-steel"
                  >
                    <td className="py-2">
                      {editing ? (
                        <input
                          className="bg-steel rounded px-2 py-1 text-sm w-full"
                          value={editingType}
                          onChange={(e) => setEditingType(e.target.value)}
                        />
                      ) : (
                        a.accessorial_type
                      )}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {editing ? (
                        <input
                          className="bg-steel rounded px-2 py-1 text-sm w-24 text-right"
                          value={editingAmount}
                          inputMode="decimal"
                          onChange={(e) =>
                            setEditingAmount(Number(e.target.value))
                          }
                        />
                      ) : (
                        money2(Number(a.amount))
                      )}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center justify-end gap-3">
                        {editing ? (
                          <>
                            <button
                              onClick={handleSaveEdit}
                              className="text-amber text-xs font-semibold"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId("")}
                              className="text-muted-text text-xs"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <Pencil
                              size={14}
                              className="text-muted-text hover:text-light cursor-pointer"
                              onClick={() =>
                                startEdit(
                                  a.accessorial_id,
                                  a.accessorial_type,
                                  a.amount,
                                )
                              }
                            />
                            <Trash2
                              size={14}
                              className="text-muted-text hover:text-destructive cursor-pointer"
                              onClick={() =>
                                handleDeleteAccessorial(a.accessorial_id)
                              }
                            />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="flex flex-wrap gap-2 mt-3">
          {otherMode ? (
            <input
              className="bg-steel rounded px-2 py-1.5 text-sm flex-1 min-w-[160px] text-light placeholder:text-muted-text"
              placeholder="New accessorial type"
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              autoFocus
            />
          ) : (
            <select
              className="bg-steel rounded px-2 py-1.5 text-sm flex-1 min-w-[160px] text-light"
              value={newType}
              onChange={(e) => {
                if (e.target.value === "__other__") {
                  setOtherMode(true);
                  setNewType("");
                } else {
                  setNewType(e.target.value);
                }
              }}
            >
              <option value="">Accessorial type…</option>
              {accTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value="__other__">Other…</option>
            </select>
          )}
          <input
            className="bg-steel rounded px-2 py-1.5 text-sm w-28 text-light placeholder:text-muted-text"
            placeholder="0.00"
            inputMode="decimal"
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
          />
          <button
            onClick={handleAddAccessorial}
            className="bg-steel text-light px-4 py-1.5 rounded text-sm border border-plate"
          >
            Add
          </button>
        </div>
      </Panel>
    </div>
  );
};
