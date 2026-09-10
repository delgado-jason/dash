import { useState } from "react";
import CityAutocomplete from "@/components/CityAutocomplete";
import {
  createAgentCoverage,
  deleteAgentCoverage,
  type AgentCoverage,
} from "@/services/agentCoverageService";
import { warmCityCoords } from "@/services/cityCoordsService";

// The footprint editor — markets an agent SAYS they cover. Shared by the Tier 3
// qualification sweep and the agent detail page so the two can't drift: the
// same capture rules, the same confidence rendering, one place to change them.
//
// Claimed intel, never facilities. `source` renders the difference: a dashed
// chip is a claim, a solid one has been proven by a load out of that city.

interface Props {
  agentId: string;
  rows: AgentCoverage[]; // already filtered to this agent
  onChanged: () => void;
  emptyText?: string;
}

export const CoverageEditor = ({
  agentId,
  rows,
  onChanged,
  emptyText = "Nothing captured yet",
}: Props) => {
  const [cityText, setCityText] = useState("");
  const [picked, setPicked] = useState<{ city: string; state: string } | null>(null);
  const [shipper, setShipper] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const add = async () => {
    if (!picked) return;
    setBusy(true);
    setErr(null);
    try {
      await createAgentCoverage({
        agent_id: agentId,
        city: picked.city,
        state: picked.state,
        shipper_name: shipper.trim() || null,
      });
      // Warm the geocode cache. Cities an agent CLAIMS are precisely the ones
      // missing from city_coords, which only holds cities already booked —
      // without this the market has no coordinate and can never be ranked by
      // distance on the Foreman.
      void warmCityCoords([{ city: picked.city, state: picked.state }]);
      setPicked(null);
      setCityText("");
      setShipper("");
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save that market");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setErr(null);
    try {
      await deleteAgentCoverage(id);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not remove that market");
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {rows.length === 0 && (
          <span className="text-faint text-[13px] italic">{emptyText}</span>
        )}
        {rows.map((c) => (
          <span
            key={c.coverage_id}
            title={
              c.source === "confirmed"
                ? "Confirmed — a load has come out of this market"
                : "Claimed — they said so; no load from here yet"
            }
            className={`inline-flex items-center gap-2 px-[11px] py-[7px] rounded-[9px] text-[13.5px] text-ink ${
              c.source === "confirmed"
                ? "border border-status-positive-text bg-status-positive-text/10"
                : "border border-dashed border-dim bg-white/5"
            }`}
          >
            <i
              className={`w-2 h-2 rounded-full ${
                c.source === "confirmed"
                  ? "bg-status-positive-text"
                  : "border-[1.5px] border-dim"
              }`}
            />
            {c.city}, {c.state}
            {c.shipper_name && (
              <span className="font-condensed text-[12.5px] tracking-[.04em] text-dim">
                {c.shipper_name}
              </span>
            )}
            <button
              onClick={() => remove(c.coverage_id)}
              aria-label={`Remove ${c.city}, ${c.state}`}
              className="text-dim hover:text-ink text-[15px] leading-none"
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="flex-1 min-w-0">
          <CityAutocomplete
            value={cityText}
            onType={(city) => {
              setCityText(city);
              setPicked(null); // typing invalidates a previous pick
            }}
            onSelect={(city, state) => {
              setCityText(`${city}, ${state}`);
              setPicked({ city, state });
            }}
            placeholder="Start typing a city…"
            inputClassName="w-full bg-canvas border border-hairline rounded-[8px] px-3 py-[10px] text-ink text-[14px]"
          />
        </div>
        <input
          value={shipper}
          onChange={(e) => setShipper(e.target.value)}
          placeholder="Shipper (optional)"
          className="w-[150px] bg-canvas border border-hairline rounded-[8px] px-3 py-[10px] text-ink text-[14px] placeholder:text-faint"
        />
        <button
          onClick={add}
          disabled={!picked || busy}
          className="bg-plate text-ink rounded-[8px] px-4 font-semibold text-[14px] disabled:bg-hairline disabled:text-faint disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>

      {err && <p className="text-status-negative-text text-[13px] mt-2">{err}</p>}

      <p className="text-dim text-[12.5px] mt-[11px] leading-[1.5]">
        <b className="text-ink">Pick the city from the dropdown</b> — a typed
        city has no coordinate, so the Foreman can't place it. Shipper name is
        optional; a market on its own is worth having.
      </p>
    </div>
  );
};

export default CoverageEditor;
