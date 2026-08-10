import { useState, useEffect } from "react";
import type { Trip } from "@/types/trip";
import type { TripInput } from "@/types/tripInput";
import {
  createTrip,
  updateTrip,
  deleteTrip,
  getLatestOdometer,
  getLastKnownLocation,
} from "@/services/tripsService";

import { Button } from "@/components/ui/button";
import { Input, inputClass } from "@/components/ui/input";
import CityAutocomplete from "@/components/CityAutocomplete";
import { Panel } from "@/components/ui/Panel";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TripFormProps {
  onSuccess: () => void;
  onClose: () => void;
  trip?: Trip | null; // present = edit mode: seeded fields, save patches, delete offered
  prefillOdometerStart?: number | null; // gap-detector handoff — overrides the latest-odometer prefill
}

// Local state allows an empty purpose so the Select starts on its placeholder
// and forces a conscious choice. The backend also rejects an empty/invalid
// purpose, so this is a UX affordance, not the only guard.
type TripFormState = Omit<TripInput, "trip_purpose"> & {
  trip_purpose: TripInput["trip_purpose"] | "";
};

const TripForm = ({ onSuccess, onClose, trip = null, prefillOdometerStart = null }: TripFormProps) => {
  const editing = trip != null;
  const [formData, setFormData] = useState<TripFormState>(() =>
    trip
      ? {
          trip_date: trip.trip_date?.slice(0, 10) ?? "",
          trip_purpose: trip.trip_purpose,
          odometer_start: trip.odometer_start ?? undefined,
          odometer_end: trip.odometer_end ?? undefined,
          is_estimated: trip.is_estimated ?? true,
          start_city: trip.start_city ?? "",
          start_state: trip.start_state ?? "",
          end_city: trip.end_city ?? "",
          end_state: trip.end_state ?? "",
        }
      : {
          trip_date: "",
          trip_purpose: "",
          odometer_start: prefillOdometerStart ?? undefined,
          odometer_end: undefined,
          is_estimated: true,
          start_city: "",
          start_state: "",
          end_city: "",
          end_state: "",
        },
  );
  const [deleting, setDeleting] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Prefill odometer_start with the truck's latest recorded odometer so trips
  // tile onto the odometer chain (each starts where the last load/trip ended).
  // Non-fatal: if it fails or there's no history, the field is just left blank.
  useEffect(() => {
    if (editing || prefillOdometerStart != null) return;
    let active = true;
    getLatestOdometer()
      .then((odo) => {
        if (active && odo != null) {
          setFormData((prev) => ({ ...prev, odometer_start: odo }));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Prefill the START location with the truck's last known spot (the end of the
  // most recent load/fuel/trip), so a trip begins where the truck actually is.
  // Non-fatal, same as the odometer prefill: no data → fields stay blank.
  useEffect(() => {
    if (editing) return;
    let active = true;
    getLastKnownLocation().then((loc) => {
      if (active && loc) {
        setFormData((prev) => ({
          ...prev,
          start_city: loc.city ?? "",
          start_state: loc.state ?? "",
        }));
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      // Blank number field → undefined (omit), never 0 — 0 would fail the
      // "> 0" odometer rule and isn't a real reading.
      [name]:
        type === "number" ? (value === "" ? undefined : Number(value)) : value,
    }));
  };

  const handleSubmit = async () => {
    setError(null);

    const purpose = formData.trip_purpose;
    if (!formData.trip_date || !purpose) {
      setError("Trip date and purpose are required");
      return;
    }

    // Blank location fields → omit (stored NULL, not ""); states normalized to
    // an uppercase 2-letter code so the location model matches cleanly.
    const clean = (v?: string) => {
      const t = v?.trim();
      return t ? t : undefined;
    };

    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        trip_purpose: purpose,
        start_city: clean(formData.start_city),
        start_state: clean(formData.start_state)?.toUpperCase(),
        end_city: clean(formData.end_city),
        end_state: clean(formData.end_state)?.toUpperCase(),
      };
      if (editing) await updateTrip(trip!.trip_id, payload);
      else await createTrip(payload);
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : editing ? "Unable to update trip" : "Unable to create trip");
    } finally {
      setSubmitting(false);
    }
  };

  // Delete lives behind a confirm — it's the one destructive act on the page.
  const handleDelete = async () => {
    if (!trip) return;
    if (!window.confirm(`Delete trip ${trip.trip_number}? This can't be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteTrip(trip.trip_id);
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to delete trip");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Panel className="p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-condensed text-ink">{editing ? `Edit Trip ${trip!.trip_number}` : "Log Trip"}</h2>
        <button onClick={onClose} className="text-muted-text hover:text-light">
          ✕
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Trip date */}
        <div>
          <Label htmlFor="trip_date">Trip Date</Label>
          <Input
            type="date"
            name="trip_date"
            id="trip_date"
            onChange={handleChange}
            value={formData.trip_date}
          />
        </div>

        {/* Purpose */}
        <div>
          <Label htmlFor="trip_purpose">Purpose</Label>
          <Select
            value={formData.trip_purpose}
            onValueChange={(value) =>
              setFormData((prev) => ({
                ...prev,
                trip_purpose: value as TripInput["trip_purpose"],
              }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a purpose" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="repositioning">Repositioning</SelectItem>
                <SelectItem value="home">Home</SelectItem>
                <SelectItem value="shop">Shop</SelectItem>
                <SelectItem value="personal">Personal</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {/* Start location — where the truck currently sits */}
        <div>
          <Label htmlFor="start_city">Start City</Label>
          <CityAutocomplete
            id="start_city"
            value={formData.start_city ?? ""}
            onType={(city) => setFormData((prev) => ({ ...prev, start_city: city }))}
            onSelect={(city, state) =>
              setFormData((prev) => ({ ...prev, start_city: city, start_state: state }))
            }
            inputClassName={inputClass}
          />
          <p className="text-xs text-muted-text mt-1">
            Prefilled from your last known location.
          </p>
        </div>

        {/* Start state */}
        <div>
          <Label htmlFor="start_state">Start State</Label>
          <Input
            name="start_state"
            id="start_state"
            onChange={handleChange}
            value={formData.start_state ?? ""}
          />
        </div>

        {/* End location — where the truck ends up (feeds its next last-known spot) */}
        <div>
          <Label htmlFor="end_city">End City</Label>
          <CityAutocomplete
            id="end_city"
            value={formData.end_city ?? ""}
            onType={(city) => setFormData((prev) => ({ ...prev, end_city: city }))}
            onSelect={(city, state) =>
              setFormData((prev) => ({ ...prev, end_city: city, end_state: state }))
            }
            inputClassName={inputClass}
          />
        </div>

        {/* End state */}
        <div>
          <Label htmlFor="end_state">End State</Label>
          <Input
            name="end_state"
            id="end_state"
            onChange={handleChange}
            value={formData.end_state ?? ""}
          />
        </div>

        {/* Odometer start */}
        <div>
          <Label htmlFor="odometer_start">Odometer Start</Label>
          <Input
            type="number"
            name="odometer_start"
            id="odometer_start"
            onChange={handleChange}
            value={formData.odometer_start ?? ""}
          />
          <p className="text-xs text-muted-text mt-1">
            Prefilled from your last recorded odometer.
          </p>
        </div>

        {/* Odometer end */}
        <div>
          <Label htmlFor="odometer_end">Odometer End</Label>
          <Input
            type="number"
            name="odometer_end"
            id="odometer_end"
            onChange={handleChange}
            value={formData.odometer_end ?? ""}
          />
        </div>

        {/* Odometer reading type */}
        <div>
          <Label htmlFor="is_estimated">Odometer Reading</Label>
          <Select
            value={formData.is_estimated ? "true" : "false"}
            onValueChange={(value) =>
              setFormData((prev) => ({
                ...prev,
                is_estimated: value === "true",
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="true">Estimated</SelectItem>
                <SelectItem value="false">Actual</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && <p className="text-destructive text-sm mt-3">{error}</p>}

      <div className="flex gap-2 mt-4">
        <Button onClick={handleSubmit} disabled={submitting || deleting}>
          {submitting ? "Saving..." : editing ? "Save Trip" : "Log Trip"}
        </Button>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        {editing && (
          <button
            onClick={handleDelete}
            disabled={submitting || deleting}
            className="ml-auto h-9 px-4 rounded-[9px] border border-status-negative-text/35 text-status-negative-text font-condensed font-semibold text-[13px] hover:bg-status-negative-text/10 disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete trip"}
          </button>
        )}
      </div>
    </Panel>
  );
};

export default TripForm;
