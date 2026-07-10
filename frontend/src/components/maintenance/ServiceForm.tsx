import { useState } from "react";
import { Check, X } from "lucide-react";
import type { MaintenanceItem, ServiceUnit } from "@/types/maintenance";
import type { ServiceInput } from "@/services/maintenanceService";

const field = "bg-steel rounded px-2 py-1 text-sm w-full";
const lbl = "text-xs text-muted-text mb-1 block";

export const ServiceForm = ({
  items,
  onSave,
  onCancel,
  busy,
}: {
  items: MaintenanceItem[];
  onSave: (data: ServiceInput) => void;
  onCancel: () => void;
  busy: boolean;
}) => {
  const [unit, setUnit] = useState<ServiceUnit>("tractor");
  const [date, setDate] = useState("");
  const [odometer, setOdometer] = useState(""); // truck reading
  const [trailerHub, setTrailerHub] = useState(""); // trailer reading
  const [vendor, setVendor] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [invoice, setInvoice] = useState("");
  const [notes, setNotes] = useState("");
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toInt = (v: string) => (v.trim() === "" ? null : parseInt(v, 10));

  const submit = () => {
    if (!date || !description.trim()) return;
    onSave({
      unit,
      service_date: date,
      // odometer = truck reading, trailer_hub = trailer reading; a service only
      // sends the reading(s) for the unit(s) it covers.
      odometer: unit === "trailer" ? null : toInt(odometer),
      trailer_hub: unit === "tractor" ? null : toInt(trailerHub),
      vendor: vendor.trim() || null,
      location: location.trim() || null,
      description: description.trim(),
      cost: cost.trim() === "" ? null : parseFloat(cost),
      invoice_number: invoice.trim() || null,
      notes: notes.trim() || null,
      item_ids: [...completed],
    });
  };

  // "both" services can complete items on either unit.
  const unitItems = items.filter(
    (i) => i.active && (unit === "both" || i.unit === unit),
  );

  return (
    <div className="bg-plate rounded-lg p-4 mb-4">
      <p className="text-sm font-medium mb-3">Log service</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className={lbl}>Unit</label>
          <select
            className={field}
            value={unit}
            onChange={(e) => {
              setUnit(e.target.value as ServiceUnit);
              setCompleted(new Set());
            }}
          >
            <option value="tractor">Tractor</option>
            <option value="trailer">Trailer</option>
            <option value="both">Both (truck + trailer)</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Date</label>
          <input
            type="date"
            className={field}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        {unit !== "trailer" && (
          <div>
            <label className={lbl}>
              {unit === "both" ? "Truck odometer" : "Odometer"}
            </label>
            <input
              className={field}
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
              placeholder="568737"
              inputMode="numeric"
            />
          </div>
        )}
        {unit !== "tractor" && (
          <div>
            <label className={lbl}>
              {unit === "both" ? "Trailer hub" : "Hubodometer"}
            </label>
            <input
              className={field}
              value={trailerHub}
              onChange={(e) => setTrailerHub(e.target.value)}
              placeholder="445000"
              inputMode="numeric"
            />
          </div>
        )}
        <div>
          <label className={lbl}>Cost</label>
          <input
            className={field}
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="433.64"
            inputMode="decimal"
          />
        </div>
        <div>
          <label className={lbl}>Vendor</label>
          <input
            className={field}
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="TA Petro"
          />
        </div>
        <div>
          <label className={lbl}>Location</label>
          <input
            className={field}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Mebane, NC"
          />
        </div>
        <div>
          <label className={lbl}>Invoice #</label>
          <input
            className={field}
            value={invoice}
            onChange={(e) => setInvoice(e.target.value)}
          />
        </div>
        <div className="col-span-2 md:col-span-4">
          <label className={lbl}>Service performed</label>
          <input
            className={field}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Landstar Ultimate PM: oil, fuel filter, separator, grease all points"
          />
        </div>
        <div className="col-span-2 md:col-span-4">
          <label className={lbl}>Notes</label>
          <input
            className={field}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="optional"
          />
        </div>
      </div>

      {unitItems.length > 0 && (
        <div className="mt-3">
          <p className={lbl}>
            Completes which scheduled items? (resets their clock)
          </p>
          <div className="flex flex-wrap gap-2">
            {unitItems.map((i) => {
              const on = completed.has(i.item_id);
              return (
                <button
                  key={i.item_id}
                  onClick={() => toggle(i.item_id)}
                  className={`text-xs px-2 py-1 rounded border ${
                    on
                      ? "bg-amber text-steel border-amber font-semibold"
                      : "bg-steel text-muted-text border-steel"
                  }`}
                >
                  {i.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <button
          className="bg-amber text-steel px-3 py-1 rounded text-sm font-semibold flex items-center gap-1 disabled:opacity-50"
          onClick={submit}
          disabled={busy || !date || !description.trim()}
        >
          <Check size={15} /> Save
        </button>
        <button
          className="bg-steel text-light px-3 py-1 rounded text-sm flex items-center gap-1"
          onClick={onCancel}
        >
          <X size={15} /> Cancel
        </button>
      </div>
    </div>
  );
};
