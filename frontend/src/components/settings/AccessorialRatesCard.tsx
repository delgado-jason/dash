import { useEffect, useState } from "react";
import { Trash2, Plus } from "lucide-react";
import type { AccessorialRate } from "@/types/accessorialRate";
import {
  getAccessorialRates,
  upsertAccessorialRate,
  deleteAccessorialRate,
} from "@/services/accessorialRateService";

const errText = (e: unknown): string =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
  "Something went wrong — try again.";

export const AccessorialRatesCard = () => {
  const [rates, setRates] = useState<AccessorialRate[] | null>(null);
  const [newType, setNewType] = useState("");
  const [newPct, setNewPct] = useState(73);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () =>
    getAccessorialRates()
      .then(setRates)
      .catch(() => setErr("Couldn't load your accessorial rates."));

  useEffect(() => {
    load();
  }, []);

  const setLocalPct = (type: string, pctInt: number) =>
    setRates((rs) =>
      rs
        ? rs.map((r) =>
            r.accessorial_type === type ? { ...r, pay_pct: pctInt / 100 } : r,
          )
        : rs,
    );

  const commit = async (type: string, pctInt: number) => {
    setMsg(null);
    setErr(null);
    try {
      await upsertAccessorialRate(type, pctInt / 100);
      setMsg(`Saved ${type}.`);
    } catch (e) {
      setErr(errText(e));
      load();
    }
  };

  const remove = async (type: string) => {
    setMsg(null);
    setErr(null);
    try {
      await deleteAccessorialRate(type);
      await load();
    } catch (e) {
      setErr(errText(e));
    }
  };

  const add = async () => {
    const t = newType.trim();
    if (!t) return;
    setMsg(null);
    setErr(null);
    try {
      await upsertAccessorialRate(t, newPct / 100);
      setNewType("");
      setNewPct(73);
      await load();
    } catch (e) {
      setErr(errText(e));
    }
  };

  return (
    <div className="mt-6 max-w-[680px] bg-plate rounded-lg p-5">
      <h2 className="text-lg font-medium text-light">Accessorial rates</h2>
      <p className="text-sm text-muted-text mt-1">
        What you keep of each accessorial charge. These feed your net revenue and
        the dropdown when you add a charge to a load. Anything not listed here
        falls back to your default accessorial rate above.
      </p>

      {!rates ? (
        <p className="text-muted-text mt-5">Loading…</p>
      ) : (
        <div className="mt-4">
          <div className="flex flex-col gap-2">
            {rates.map((r) => (
              <div
                key={r.accessorial_type}
                className="flex items-center gap-3 rounded px-3 py-2"
                style={{ background: "#0d1119" }}
              >
                <span className="text-sm text-light flex-1">
                  {r.accessorial_type}
                </span>
                <input
                  type="number"
                  min={0}
                  max={200}
                  step={1}
                  value={Math.round(r.pay_pct * 100)}
                  onChange={(e) =>
                    setLocalPct(r.accessorial_type, Number(e.target.value))
                  }
                  onBlur={(e) =>
                    commit(r.accessorial_type, Number(e.target.value))
                  }
                  className="w-20 bg-steel rounded px-2 py-1 text-light text-right tabular-nums"
                />
                <span className="text-muted-text text-sm">%</span>
                <button
                  onClick={() => remove(r.accessorial_type)}
                  className="text-muted-text hover:text-destructive"
                  aria-label={`Delete ${r.accessorial_type}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 mt-3">
            <input
              type="text"
              placeholder="New accessorial (e.g. Lumper)"
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="flex-1 bg-steel rounded px-2 py-1.5 text-light text-sm"
            />
            <input
              type="number"
              min={0}
              max={200}
              step={1}
              value={newPct}
              onChange={(e) => setNewPct(Number(e.target.value))}
              className="w-20 bg-steel rounded px-2 py-1.5 text-light text-right tabular-nums"
            />
            <span className="text-muted-text text-sm">%</span>
            <button
              onClick={add}
              disabled={!newType.trim()}
              className="bg-amber text-steel px-3 py-1.5 rounded text-sm font-semibold flex items-center gap-1 disabled:opacity-50"
            >
              <Plus size={14} /> Add
            </button>
          </div>

          {msg && (
            <p className="text-status-positive-text text-sm mt-3">{msg}</p>
          )}
          {err && <p className="text-destructive text-sm mt-3">{err}</p>}
        </div>
      )}
    </div>
  );
};
