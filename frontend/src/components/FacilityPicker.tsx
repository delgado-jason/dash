import { useState } from "react";
import type { Facility } from "@/types/facility";
import { createFacility } from "@/services/facilitiesService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  label: string; // "Shipper" / "Receiver"
  facilities: Facility[];
  value?: string | null; // selected facility_id
  defaultCity?: string; // prefilled on create, from the load's origin/destination
  defaultState?: string;
  onSelect: (facility: Facility | null) => void;
  onCreated: (facility: Facility) => void;
}

// Pick an existing facility or create a new one inline. Creating one whose
// name+city+state already exists just returns that facility (find-or-create on
// the server), so it can't duplicate a dock.
export const FacilityPicker = ({
  label,
  facilities,
  value,
  defaultCity,
  defaultState,
  onSelect,
  onCreated,
}: Props) => {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    city: defaultCity ?? "",
    state: defaultState ?? "",
    address: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const f = await createFacility({
        name: form.name,
        city: form.city,
        state: form.state,
        address: form.address || null,
      });
      onCreated(f);
      onSelect(f);
      setCreating(false);
      setForm({ name: "", city: defaultCity ?? "", state: defaultState ?? "", address: "" });
    } catch (e) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Could not create facility",
      );
    } finally {
      setBusy(false);
    }
  };

  if (creating) {
    return (
      <div>
        <Label>
          {label} facility · <span className="text-status-positive-text">new</span>
        </Label>
        <div className="border border-dashed border-steel rounded-md p-3 grid gap-2 mt-1">
          <Input
            placeholder="Facility name (e.g. Walmart DC 6094)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div className="flex gap-2">
            <Input
              placeholder="City"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
            <Input
              placeholder="ST"
              maxLength={2}
              className="w-16"
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
            />
          </div>
          <Input
            placeholder="Street address (optional)"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          {error && <p className="text-destructive text-xs">{error}</p>}
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={create}
              disabled={busy || !form.name || !form.city || form.state.trim().length !== 2}
            >
              {busy ? "Saving…" : "Create facility"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Label>{label} facility</Label>
      <div className="flex gap-2">
        <Select
          value={value ?? ""}
          onValueChange={(id) =>
            onSelect(facilities.find((f) => f.facility_id === id) ?? null)
          }
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={`Select ${label.toLowerCase()} facility`} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {facilities.map((f) => (
                <SelectItem key={f.facility_id} value={f.facility_id}>
                  {f.name} · {f.city}, {f.state}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" onClick={() => setCreating(true)}>
          ＋ New
        </Button>
      </div>
    </div>
  );
};
