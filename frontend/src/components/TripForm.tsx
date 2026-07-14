import { useState, useEffect } from "react";
import type { TripInput } from "@/types/tripInput";
import { createTrip, getLatestOdometer } from "@/services/tripsService";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
}

// Local state allows an empty purpose so the Select starts on its placeholder
// and forces a conscious choice. The backend also rejects an empty/invalid
// purpose, so this is a UX affordance, not the only guard.
type TripFormState = Omit<TripInput, "trip_purpose"> & {
  trip_purpose: TripInput["trip_purpose"] | "";
};

const TripForm = ({ onSuccess, onClose }: TripFormProps) => {
  const [formData, setFormData] = useState<TripFormState>({
    trip_date: "",
    trip_purpose: "",
    odometer_start: undefined,
    odometer_end: undefined,
    is_estimated: true,
  });

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Prefill odometer_start with the truck's latest recorded odometer so trips
  // tile onto the odometer chain (each starts where the last load/trip ended).
  // Non-fatal: if it fails or there's no history, the field is just left blank.
  useEffect(() => {
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

    setSubmitting(true);
    try {
      await createTrip({ ...formData, trip_purpose: purpose });
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create trip");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Panel className="p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-condensed text-light">Log Trip</h2>
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
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Saving..." : "Log Trip"}
        </Button>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Panel>
  );
};

export default TripForm;
