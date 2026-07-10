import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Pencil, Trash2, Truck, User, Container } from "lucide-react";

import { useLoad } from "@/hooks/useLoad";
import { useAccessorials } from "@/hooks/useAccessorials";
import { useBrokers } from "@/hooks/useBrokers";
import { useAgents } from "@/hooks/useAgents";
import { useMarkets } from "@/hooks/useMarkets";

import { patchLoad } from "@/services/patchLoadService";
import { createAccessorial } from "@/services/createAccessorialService";
import { deleteAccessorial } from "@/services/deleteAccessorialService";
import { patchAccessorial } from "@/services/patchAccessorialService";
import { deleteLoad } from "@/services/deleteLoadService";

import LoadForm from "@/components/LoadForm";
import { StatusBadge } from "@/components/StatusBadge";
import { Kpi } from "@/components/Kpi";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { loadRevenue, loadRpm, deadheadShare } from "@/lib/metrics/loads";
import {
  estimateLoadFuel,
  ASSUMED_MPG,
  ASSUMED_FUEL_PRICE,
} from "@/lib/metrics/fuel";
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

const LOAD_STATUSES = ["booked", "in_transit", "delivered", "cancelled", "tonu"];
const PAYMENT_STATUSES = ["unpaid", "invoiced", "paid", "cancelled"];

export const LoadDetailPage = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [accRefreshKey, setAccRefreshKey] = useState(0);
  const { load, isLoading, error } = useLoad(refreshKey);
  const { accessorials } = useAccessorials(accRefreshKey);

  const [newType, setNewType] = useState("");
  const [newAmount, setNewAmount] = useState("");
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

  const navigate = useNavigate();

  useEffect(() => {
    if (load) {
      setStatusSel(load.load_status);
      setPaymentSel(load.payment_status);
    }
  }, [load]);

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
  const rpm = loadRpm(load);
  const dh = deadheadShare(load);
  const fuel = estimateLoadFuel(load);
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
          <div className="relative w-[750px] max-h-[90vh] bg-iron text-light overflow-y-auto shadow-xl rounded-lg p-6 border border-plate">
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
                dimensions: load.dimensions ?? null,
                shipper_name: load.shipper_name ?? null,
                receiver_name: load.receiver_name ?? null,
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
        <div className="bg-plate rounded-lg p-4">
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
        </div>

        <div className="bg-plate rounded-lg p-4 border border-amber">
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
        </div>

        <div className="bg-plate rounded-lg p-4">
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
            <span>Total</span>
            <span className="font-condensed text-base">{money2(revenue)}</span>
          </div>
        </div>

        <div className="bg-plate rounded-lg p-4">
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
        </div>

        <div className="bg-plate rounded-lg p-4">
          <p className={cardLbl}>Cargo</p>
          <Row label="Commodity" value={load.commodity || "—"} />
          <Row
            label="Weight"
            value={load.weight ? `${load.weight.toLocaleString("en-US")} lb` : "—"}
          />
          <Row label="Dimensions" value={load.dimensions || "Legal"} />
        </div>

        <div className="bg-plate rounded-lg p-4">
          <p className={cardLbl}>Dates</p>
          <Row label="Pickup" value={fmtDate(load.pickup_date)} />
          <Row label="Delivery" value={fmtDate(load.delivery_date)} />
          <Row
            label="Shipper → receiver"
            value={`${load.shipper_name || "—"} → ${load.receiver_name || "—"}`}
          />
        </div>

        <div className="bg-plate rounded-lg p-4">
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
                label="Assumed"
                value={`${ASSUMED_MPG} mpg · $${ASSUMED_FUEL_PRICE.toFixed(2)}/gal`}
              />
              <p className="text-xs text-muted-text mt-2">
                {fuel.basis === "actual"
                  ? "Based on the odometer readings entered for this load."
                  : "Estimated from loaded + deadhead miles. Enter odometer start and end to reflect actual miles."}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-text">
              Add loaded miles to estimate fuel.
            </p>
          )}
        </div>

        <div className="bg-plate rounded-lg p-4">
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
        </div>

        <div className="bg-plate rounded-lg p-4 md:col-span-2">
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
        </div>
      </div>

      <div className="bg-plate rounded-lg p-4 mt-4">
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
          <input
            className="bg-steel rounded px-2 py-1.5 text-sm flex-1 min-w-[160px] text-light placeholder:text-muted-text"
            placeholder="Type — e.g. Layover"
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
          />
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
      </div>
    </div>
  );
};
