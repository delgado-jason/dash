import { useEffect, useRef, useState } from "react";
import type { Facility } from "@/types/facility";
import { normalizeFacilityName, facilityLabel } from "@/lib/facilityMatch";
import { FacilityCreateForm } from "@/components/FacilityCreateForm";
import { Label } from "@/components/ui/label";

interface Props {
  label: string; // "Shipper" / "Receiver"
  facilities: Facility[];
  value?: string | null; // selected facility_id
  defaultCity?: string; // prefilled on create, from the load's origin/destination
  defaultState?: string;
  onSelect: (facility: Facility | null) => void;
  onCreated: (facility: Facility) => void;
}

const KindTag = ({ kind }: { kind: string }) => (
  <span
    className="text-[9px] px-1.5 py-0.5 rounded-full"
    style={
      kind === "job_site"
        ? { background: "#1e2740", color: "#9db2d8" }
        : { background: "#12251a", color: "#6fd08c" }
    }
  >
    {kind === "job_site" ? "job site" : "business"}
  </span>
);

// Type-to-search facility picker. Live-filters existing docks so you reuse one
// before you'd ever make a near-duplicate; the "looks like this exists" nudge
// catches the Inc/LLC case that a substring search would miss.
export const FacilityPicker = ({
  label,
  facilities,
  value,
  defaultCity,
  defaultState,
  onSelect,
  onCreated,
}: Props) => {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = facilities.find((f) => f.facility_id === value) ?? null;

  // Show the selected facility's label in the box when not actively searching.
  useEffect(() => {
    if (selected && !open) setQuery(facilityLabel(selected));
    if (!selected && !open) setQuery("");
  }, [selected, open]);

  // Click outside closes the dropdown.
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const q = query.trim().toLowerCase();
  const matches = q
    ? facilities.filter((f) =>
        `${f.name ?? ""} ${f.address ?? ""} ${f.city} ${f.state}`
          .toLowerCase()
          .includes(q),
      )
    : facilities;

  // Fuzzy nudge: a facility whose normalized name equals the normalized query
  // but isn't already an exact substring hit (the Inc/LLC case).
  const nq = normalizeFacilityName(query);
  const nudge =
    nq.length > 0
      ? facilities.find(
          (f) =>
            normalizeFacilityName(facilityLabel(f)) === nq &&
            !matches.some((m) => m.facility_id === f.facility_id),
        )
      : undefined;

  const choose = (f: Facility) => {
    onSelect(f);
    setQuery(facilityLabel(f));
    setOpen(false);
    setCreating(false);
  };

  const resolveCreated = (f: Facility) => {
    onCreated(f); // parent de-dupes its list
    choose(f);
  };

  return (
    <div ref={ref} className="relative">
      <Label>{label} facility</Label>
      <input
        className="w-full bg-steel rounded px-2 py-1.5 text-sm text-light placeholder:text-muted-text"
        placeholder={`Search or add ${label.toLowerCase()} facility`}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setCreating(false);
          if (selected) onSelect(null);
        }}
        onFocus={() => setOpen(true)}
      />

      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 rounded-md border border-steel bg-iron shadow-xl overflow-hidden">
          {creating ? (
            <div className="p-2">
              <FacilityCreateForm
                facilities={facilities}
                defaultCity={defaultCity}
                defaultState={defaultState}
                defaultName={query}
                onResolved={resolveCreated}
                onCancel={() => setCreating(false)}
              />
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {nudge && (
                <div
                  className="px-2.5 py-2 flex items-center justify-between gap-2"
                  style={{ background: "#241a0e", borderBottom: "1px solid #3a2a12" }}
                >
                  <span className="text-[11px]" style={{ color: "#f5c37a" }}>
                    ⚠ Looks like this exists · {facilityLabel(nudge)} · {nudge.city},{" "}
                    {nudge.state}
                  </span>
                  <button
                    type="button"
                    onClick={() => choose(nudge)}
                    className="bg-amber text-steel text-[11px] px-2 py-0.5 rounded font-semibold shrink-0"
                  >
                    Use it
                  </button>
                </div>
              )}
              {matches.slice(0, 30).map((f) => (
                <button
                  key={f.facility_id}
                  type="button"
                  onClick={() => choose(f)}
                  className="w-full text-left px-2.5 py-2 text-sm hover:bg-steel flex items-center gap-2 border-t border-plate first:border-t-0"
                >
                  <span className="truncate">
                    {facilityLabel(f)}{" "}
                    <span className="text-muted-text">
                      · {f.city}, {f.state}
                    </span>
                  </span>
                  <span className="ml-auto shrink-0">
                    <KindTag kind={f.kind} />
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="w-full text-left px-2.5 py-2 text-sm border-t border-plate"
                style={{ color: "#6fd08c" }}
              >
                ＋ Add {query.trim() ? `"${query.trim()}"` : "a facility"}…
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
