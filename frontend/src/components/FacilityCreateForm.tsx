import { useState } from "react";
import type { Facility, FacilityKind } from "@/types/facility";
import { createFacility } from "@/services/facilitiesService";
import { findDuplicate, facilityLabel } from "@/lib/facilityMatch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  facilities: Facility[]; // for the soft duplicate check
  defaultCity?: string;
  defaultState?: string;
  defaultName?: string; // prefilled from the picker's search text
  onResolved: (facility: Facility) => void; // created, or an existing one reused
  onCancel: () => void;
}

// Create a facility, with the kind toggle and the soft "looks like this exists"
// warning. A business is identified by name, a job site by address.
export const FacilityCreateForm = ({
  facilities,
  defaultCity,
  defaultState,
  defaultName,
  onResolved,
  onCancel,
}: Props) => {
  const [kind, setKind] = useState<FacilityKind>("business");
  const [name, setName] = useState(defaultName ?? "");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState(defaultCity ?? "");
  const [state, setState] = useState(defaultState ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dup = findDuplicate(facilities, { kind, name, address, city, state });
  const canSubmit =
    !!city.trim() &&
    state.trim().length === 2 &&
    (kind === "job_site" ? !!address.trim() : !!name.trim());

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const f = await createFacility({
        kind,
        name: name.trim() || null,
        address: address.trim() || null,
        city: city.trim(),
        state: state.trim(),
      });
      onResolved(f);
    } catch (e) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Could not create facility",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-dashed border-steel rounded-md p-3 grid gap-2">
      <div className="inline-flex bg-steel rounded-lg p-0.5 gap-0.5 w-fit">
        {(["business", "job_site"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`text-xs px-3 py-1 rounded ${
              kind === k
                ? "bg-amber text-steel font-semibold"
                : "text-muted-text"
            }`}
          >
            {k === "business" ? "Business" : "Job site"}
          </button>
        ))}
      </div>

      {kind === "business" ? (
        <div>
          <Label>Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ABC Manufacturing"
          />
        </div>
      ) : (
        <div>
          <Label>
            Address / location <span className="text-destructive">*</span>
          </Label>
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="1420 Construction Pkwy"
          />
        </div>
      )}

      <div className="flex gap-2">
        <Input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
        <Input
          placeholder="ST"
          maxLength={2}
          className="w-16"
          value={state}
          onChange={(e) => setState(e.target.value)}
        />
      </div>

      {kind === "business" ? (
        <Input
          placeholder="Street address (optional)"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      ) : (
        <Input
          placeholder="Label (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      )}

      {error && <p className="text-destructive text-xs">{error}</p>}

      {dup ? (
        <div
          className="rounded-md p-2"
          style={{ border: "1px solid #7a4718", background: "#241a0e" }}
        >
          <p className="text-[11px]" style={{ color: "#f5c37a" }}>
            ⚠ Looks like{" "}
            <b>
              {facilityLabel(dup)} · {dup.city}, {dup.state}
            </b>{" "}
            already exists.
          </p>
          <div className="flex gap-2 mt-2 items-center">
            <Button type="button" size="sm" onClick={() => onResolved(dup)}>
              Use existing
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={create}
              disabled={busy || !canSubmit}
            >
              Create anyway
            </Button>
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-muted-text underline"
            >
              cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={create} disabled={busy || !canSubmit}>
            {busy ? "Saving…" : "Create facility"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
};
