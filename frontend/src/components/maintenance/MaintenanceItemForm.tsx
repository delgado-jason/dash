import { useState } from "react";
import type { MaintenanceItem, MaintenanceUnit } from "@/types/maintenance";
import type { ItemInput } from "@/services/maintenanceService";
import { Panel } from "@/components/ui/Panel";

const CATEGORIES = [
  "engine",
  "chassis",
  "brakes",
  "compliance",
  "trailer",
  "apu",
  "other",
];

// Each unit reads its own meter, so the baseline field changes with the unit.
const UNITS: [MaintenanceUnit, string][] = [
  ["tractor", "Tractor"],
  ["trailer", "Trailer"],
  ["apu", "APU"],
];

const field = "bg-well rounded px-2 py-1 text-sm w-full";
const lbl = "text-xs text-faint mb-1 block";

export const MaintenanceItemForm = ({
  initial,
  onSave,
  onCancel,
  onDelete,
  busy,
}: {
  initial: MaintenanceItem | null;
  onSave: (data: ItemInput) => void;
  onCancel: () => void;
  onDelete?: () => void;
  busy: boolean;
}) => {
  const [unit, setUnit] = useState<MaintenanceUnit>(initial?.unit ?? "tractor");
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "engine");
  const [miles, setMiles] = useState(initial?.interval_miles?.toString() ?? "");
  const [hours, setHours] = useState(initial?.interval_hours?.toString() ?? "");
  const [months, setMonths] = useState(initial?.interval_months?.toString() ?? "");
  const [lastMiles, setLastMiles] = useState(
    initial?.last_done_miles?.toString() ?? "",
  );
  const [lastHours, setLastHours] = useState(
    initial?.last_done_hours?.toString() ?? "",
  );
  const [lastDate, setLastDate] = useState(initial?.last_done_date ?? "");
  const [warn, setWarn] = useState(initial?.warn_lead_days?.toString() ?? "14");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const intOrNull = (s: string) => (s.trim() === "" ? null : parseInt(s, 10));
  const isApu = unit === "apu";

  const submit = () => {
    if (!name.trim()) return;
    onSave({
      unit,
      name: name.trim(),
      category,
      // A unit only sends the interval and the baseline it can actually read.
      interval_miles: isApu ? null : intOrNull(miles),
      interval_hours: isApu ? intOrNull(hours) : null,
      interval_months: intOrNull(months),
      last_done_miles: isApu ? null : intOrNull(lastMiles),
      last_done_hours: isApu ? intOrNull(lastHours) : null,
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
          <label className={lbl} htmlFor="mi-name">
            Name
          </label>
          <input
            id="mi-name"
            className={field}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Engine oil + filter"
          />
        </div>
        <div>
          <label className={lbl} htmlFor="mi-unit">
            Unit
          </label>
          <select
            id="mi-unit"
            className={field}
            value={unit}
            onChange={(e) => setUnit(e.target.value as MaintenanceUnit)}
          >
            {UNITS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={lbl} htmlFor="mi-category">
            Category
          </label>
          <select
            id="mi-category"
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
          <label className={lbl} htmlFor="mi-interval">
            {isApu ? "Every (hours)" : "Every (miles)"}
          </label>
          <input
            id="mi-interval"
            className={field}
            value={isApu ? hours : miles}
            onChange={(e) => (isApu ? setHours : setMiles)(e.target.value)}
            placeholder={isApu ? "1000" : "25000"}
            inputMode="numeric"
          />
        </div>
        <div>
          <label className={lbl} htmlFor="mi-months">
            Every (months)
          </label>
          <input
            id="mi-months"
            className={field}
            value={months}
            onChange={(e) => setMonths(e.target.value)}
            placeholder="12"
            inputMode="numeric"
          />
        </div>
        <div>
          <label className={lbl} htmlFor="mi-baseline">
            {isApu ? "Last done · APU hours" : "Last done · odometer"}
          </label>
          <input
            id="mi-baseline"
            className={field}
            value={isApu ? lastHours : lastMiles}
            onChange={(e) => (isApu ? setLastHours : setLastMiles)(e.target.value)}
            placeholder={isApu ? "1240" : "560905"}
            inputMode="numeric"
          />
        </div>
        <div>
          <label className={lbl} htmlFor="mi-date">
            Last done · date
          </label>
          <input
            id="mi-date"
            type="date"
            className={field}
            value={lastDate ?? ""}
            onChange={(e) => setLastDate(e.target.value)}
          />
        </div>
        <div>
          <label className={lbl} htmlFor="mi-warn">
            Warn me (days before)
          </label>
          <input
            id="mi-warn"
            className={field}
            value={warn}
            onChange={(e) => setWarn(e.target.value)}
            placeholder="14"
            inputMode="numeric"
          />
        </div>
        <div className="col-span-2 md:col-span-3">
          <label className={lbl} htmlFor="mi-notes">
            Notes
          </label>
          <input
            id="mi-notes"
            className={field}
            value={notes ?? ""}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="optional"
          />
        </div>
      </div>
      <p className="text-[11px] text-faint mt-2">
        {isApu
          ? "Set an hours or a month interval. The APU counts HOURS — fill \"last done · APU hours\" to start the clock, or log a service that reads the meter."
          : "Set at least a mileage or a month interval. Fill \"last done\" to start the clock — or just log a service that completes it."}
      </p>
      <div className="flex gap-2 mt-3">
        <button
          className="bg-amber text-steel px-3 py-1 rounded text-sm font-semibold flex items-center gap-1 disabled:opacity-50"
          onClick={submit}
          disabled={busy || !name.trim()}
        >
          Save
        </button>
        <button
          className="bg-well text-light px-3 py-1 rounded text-sm flex items-center gap-1"
          onClick={onCancel}
        >
          Cancel
        </button>
        {onDelete && (
          <button
            className="ml-auto text-faint hover:text-[#e05252] px-3 py-1 rounded text-sm disabled:opacity-50"
            onClick={onDelete}
            disabled={busy}
          >
            Delete clock
          </button>
        )}
      </div>
    </Panel>
  );
};
