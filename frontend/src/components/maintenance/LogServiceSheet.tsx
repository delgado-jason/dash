import { useState } from "react";
import type { MaintenanceItem, ServiceUnit } from "@/types/maintenance";
import type { ServiceInput } from "@/services/maintenanceService";
import type { Vendor } from "@/types/vendor";
import { Board } from "@/components/ui/Board";
import CityAutocomplete from "@/components/CityAutocomplete";
import VendorAutocomplete from "@/components/vendors/VendorAutocomplete";
import { parseReading, parseCost } from "@/lib/maintenance/parseReading";
import {
  FieldLabel,
  PrimaryButton,
  GhostButton,
} from "@/components/relationships/primitives";

// The log-service SHEET (the shop nod sheet's "Log service · the sheet").
// One column of fields in the order a man with an invoice in his hand fills
// them: what was worked on, when, the meter, who did it, where, what they did,
// which clocks it reset, what it cost.
//
// The unit decides which meter the sheet asks for — Truck an odometer, Trailer
// a hubodometer, Both reads both, APU reads HOURS (decision 4A). The city box
// is the HERE picker the load form already uses; it writes "City, ST" into
// `location` and nothing else (decision 7A). The vendor box is the rolodex
// typeahead, which turns a merged spelling into the vendor's own name as he
// types it (decision 12A).

// [value, label] — the segmented control, in the mock's order.
const UNITS: [ServiceUnit, string][] = [
  ["tractor", "Truck"],
  ["trailer", "Trailer"],
  ["both", "Both"],
  ["apu", "APU"],
];

// Which items a service on this unit can complete. "Both" covers the truck and
// the trailer; the APU only ever completes APU clocks.
const completableBy = (unit: ServiceUnit, items: MaintenanceItem[]) =>
  items.filter((i) => {
    if (!i.active) return false;
    if (unit === "both") return i.unit === "tractor" || i.unit === "trailer";
    return i.unit === unit;
  });

export const LogServiceSheet = ({
  items,
  vendors,
  onSave,
  onCancel,
  busy,
}: {
  items: MaintenanceItem[];
  vendors: Vendor[];
  onSave: (data: ServiceInput) => void;
  onCancel: () => void;
  busy: boolean;
}) => {
  const [unit, setUnit] = useState<ServiceUnit>("tractor");
  const [date, setDate] = useState("");
  const [odometer, setOdometer] = useState(""); // truck reading
  const [trailerHub, setTrailerHub] = useState(""); // trailer reading
  const [apuHours, setApuHours] = useState(""); // the APU's hour meter
  const [vendor, setVendor] = useState("");
  const [location, setLocation] = useState(""); // "City, ST"
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [invoice, setInvoice] = useState("");
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const unitItems = completableBy(unit, items);
  const ready = !!date && description.trim().length > 0;

  const submit = () => {
    if (!ready) return;
    onSave({
      unit,
      service_date: date,
      // Each unit sends only the meter it actually reads. A blank box is a
      // reading nobody took — null, never 0 (parseReading, which keeps the
      // decimal point an odometer box can carry).
      odometer: unit === "tractor" || unit === "both" ? parseReading(odometer) : null,
      trailer_hub:
        unit === "trailer" || unit === "both" ? parseReading(trailerHub) : null,
      apu_hours: unit === "apu" ? parseReading(apuHours) : null,
      vendor: vendor.trim() || null,
      location: location.trim() || null,
      description: description.trim(),
      cost: parseCost(cost),
      invoice_number: invoice.trim() || null,
      item_ids: [...completed],
    });
  };

  return (
    <Board className="p-4 sm:p-5 mb-4">
      <p className="font-forge font-bold text-[15px] tracking-[.1em] uppercase mb-4">
        Log service
      </p>

      <div className="grid gap-3.5">
        <div>
          <FieldLabel>Unit</FieldLabel>
          <span
            className="inline-flex h-[32px] p-[3px] rounded-[9px] bg-well gap-[2px]"
            style={{ boxShadow: "inset 0 2px 4px rgba(0,0,0,.5)" }}
            role="group"
            aria-label="Unit"
          >
            {UNITS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={unit === value}
                onClick={() => {
                  setUnit(value);
                  setCompleted(new Set()); // a different unit, different clocks
                }}
                className={`px-3 rounded-md font-condensed font-semibold text-[12.5px] ${
                  unit === value ? "bg-amber text-canvas" : "text-dim hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <FieldLabel htmlFor="svc-date">Date</FieldLabel>
            <input
              id="svc-date"
              type="date"
              className="ds-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          {unit === "apu" ? (
            <div>
              <FieldLabel htmlFor="svc-apu-hours">APU hours</FieldLabel>
              <input
                id="svc-apu-hours"
                className="ds-input"
                value={apuHours}
                onChange={(e) => setApuHours(e.target.value)}
                placeholder="meter reading"
                inputMode="numeric"
              />
            </div>
          ) : (
            <div className={unit === "both" ? "grid grid-cols-2 gap-3.5" : ""}>
              {unit !== "trailer" && (
                <div>
                  <FieldLabel htmlFor="svc-odometer">
                    {unit === "both" ? "Truck odometer" : "Odometer"}
                  </FieldLabel>
                  <input
                    id="svc-odometer"
                    className="ds-input"
                    value={odometer}
                    onChange={(e) => setOdometer(e.target.value)}
                    placeholder="568737"
                    inputMode="numeric"
                  />
                </div>
              )}
              {unit !== "tractor" && (
                <div>
                  <FieldLabel htmlFor="svc-hub">
                    {unit === "both" ? "Trailer hub" : "Hubodometer"}
                  </FieldLabel>
                  <input
                    id="svc-hub"
                    className="ds-input"
                    value={trailerHub}
                    onChange={(e) => setTrailerHub(e.target.value)}
                    placeholder="456123"
                    inputMode="numeric"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <FieldLabel htmlFor="svc-vendor">Vendor</FieldLabel>
            <VendorAutocomplete
              id="svc-vendor"
              value={vendor}
              onChange={setVendor}
              vendors={vendors}
              placeholder="Thermo King"
              inputClassName="ds-input"
            />
          </div>
          <div>
            <FieldLabel htmlFor="svc-city">City · fills state</FieldLabel>
            <CityAutocomplete
              id="svc-city"
              value={location}
              onType={setLocation}
              // The picker writes the canonical "City, ST" and nothing else.
              onSelect={(city, state) => setLocation(`${city}, ${state}`)}
              placeholder="Carlisle, PA"
              inputClassName="ds-input"
            />
          </div>
        </div>

        <div>
          <FieldLabel htmlFor="svc-work">Work done</FieldLabel>
          <input
            id="svc-work"
            className="ds-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Replace alternator and belt on APU. Checked and verified air flow."
          />
        </div>

        {unitItems.length > 0 && (
          <div>
            <FieldLabel>Completes</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {unitItems.map((i) => {
                const on = completed.has(i.item_id);
                return (
                  <button
                    key={i.item_id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(i.item_id)}
                    className={`inline-flex items-center h-[24px] px-2.5 rounded-[12px] font-condensed font-semibold text-[11.5px] ${
                      on
                        ? "text-amber-hi border border-amber/40 bg-amber/[.1]"
                        : "text-faint border border-hairline hover:text-dim"
                    }`}
                  >
                    {i.name}
                  </button>
                );
              })}
            </div>
            {unit === "apu" && (
              <p className="font-condensed text-[11.5px] text-faint mt-1.5">
                Completing an APU clock stamps its last-done hours from the
                reading above — without one, the clock keeps its date and still
                needs a meter.
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <FieldLabel htmlFor="svc-cost">Cost</FieldLabel>
            <input
              id="svc-cost"
              className="ds-input"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="1358.70"
              inputMode="decimal"
            />
          </div>
          <div>
            <FieldLabel htmlFor="svc-invoice">Invoice #</FieldLabel>
            <input
              id="svc-invoice"
              className="ds-input"
              value={invoice}
              onChange={(e) => setInvoice(e.target.value)}
              placeholder="optional"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-5">
        <PrimaryButton onClick={submit} disabled={busy || !ready}>
          Log it
        </PrimaryButton>
        <GhostButton onClick={onCancel}>Cancel</GhostButton>
      </div>
    </Board>
  );
};
