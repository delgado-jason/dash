import { useState } from "react";
import { Check, X } from "lucide-react";
import type { MaintenanceItem, MaintenanceUnit } from "@/types/maintenance";
import type { ItemInput } from "@/services/maintenanceService";
import { Panel } from "@/components/ui/Panel";

const CATEGORIES = ["engine", "chassis", "brakes", "compliance", "trailer", "other"];

const field = "bg-steel rounded px-2 py-1 text-sm w-full";
const lbl = "text-xs text-muted-text mb-1 block";

export const MaintenanceItemForm = ({
  initial,
  onSave,
  onCancel,
  busy,
}: {
  initial: MaintenanceItem | null;
  onSave: (data: ItemInput) => void;
  onCancel: () => void;
  busy: boolean;
}) => {
  const [unit, setUnit] = useState<MaintenanceUnit>(initial?.unit ?? "tractor");
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "engine");
  const [miles, setMiles] = useState(initial?.interval_miles?.toString() ?? "");
  const [months, setMonths] = useState(initial?.interval_months?.toString() ?? "");
  const [lastMiles, setLastMiles] = useState(
    initial?.last_done_miles?.toString() ?? "",
  );
  const [lastDate, setLastDate] = useState(initial?.last_done_date ?? "");
  const [warn, setWarn] = useState(initial?.warn_lead_days?.toString() ?? "14");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const intOrNull = (s: string) => (s.trim() === "" ? null : parseInt(s, 10));

  const submit = () => {
    if (!name.trim()) return;
    onSave({
      unit,
      name: name.trim(),
      category,
      interval_miles: intOrNull(miles),
      interval_months: intOrNull(months),
      last_done_miles: intOrNull(lastMiles),
      last_done_date: lastDate || null,
      warn_lead_days: intOrNull(warn) ?? 14,
      notes: notes.trim() || null,
    });
  };

  return (
    <Panel className="p-4 mb-4">
      <p className="text-sm font-medium mb-3">
        {initial ? "Edit item" : "New maintenance item"}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        <div className="col-span-2 md:col-span-1">
          <label className={lbl}>Name</label>
          <input
            className={field}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Engine oil + filter"
          />
        </div>
        <div>
          <label className={lbl}>Unit</label>
          <select
            className={field}
            value={unit}
            onChange={(e) => setUnit(e.target.value as MaintenanceUnit)}
          >
            <option value="tractor">Tractor</option>
            <option value="trailer">Trailer</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Category</label>
          <select
            className={field}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={lbl}>Every (miles)</label>
          <input
            className={field}
            value={miles}
            onChange={(e) => setMiles(e.target.value)}
            placeholder="25000"
            inputMode="numeric"
          />
        </div>
        <div>
          <label className={lbl}>Every (months)</label>
          <input
            className={field}
            value={months}
            onChange={(e) => setMonths(e.target.value)}
            placeholder="12"
            inputMode="numeric"
          />
        </div>
        <div>
          <label className={lbl}>Last done · odometer</label>
          <input
            className={field}
            value={lastMiles}
            onChange={(e) => setLastMiles(e.target.value)}
            placeholder="560905"
            inputMode="numeric"
          />
        </div>
        <div>
          <label className={lbl}>Last done · date</label>
          <input
            type="date"
            className={field}
            value={lastDate ?? ""}
            onChange={(e) => setLastDate(e.target.value)}
          />
        </div>
        <div>
          <label className={lbl}>Warn me (days before)</label>
          <input
            className={field}
            value={warn}
            onChange={(e) => setWarn(e.target.value)}
            placeholder="14"
            inputMode="numeric"
          />
        </div>
        <div className="col-span-2 md:col-span-3">
          <label className={lbl}>Notes</label>
          <input
            className={field}
            value={notes ?? ""}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="optional"
          />
        </div>
      </div>
      <p className="text-[11px] text-muted-text mt-2">
        Set at least a mileage or a month interval. Fill "last done" to start the
        clock — or just log a service that completes it.
      </p>
      <div className="flex gap-2 mt-3">
        <button
          className="bg-amber text-steel px-3 py-1 rounded text-sm font-semibold flex items-center gap-1 disabled:opacity-50"
          onClick={submit}
          disabled={busy || !name.trim()}
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
    </Panel>
  );
};
