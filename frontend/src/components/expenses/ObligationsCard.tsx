import { useEffect, useState } from "react";
import { Pencil, Trash2, Check, X, Plus } from "lucide-react";
import type { Obligation } from "@/types/obligation";
import {
  getObligations,
  createObligation,
  patchObligation,
  deleteObligation,
} from "@/services/obligationsService";
import { getCashMetrics } from "@/lib/metrics/expenses";

interface Props {
  operatingCost: number;
  totalMiles: number;
  loadedMiles: number;
}

const money = (n: number): string =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export const ObligationsCard = ({ operatingCost, totalMiles, loadedMiles }: Props) => {
  const [items, setItems] = useState<Obligation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editAmt, setEditAmt] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newAmt, setNewAmt] = useState("");

  const load = () => getObligations().then(setItems).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const activeTotal = items
    .filter((o) => o.active)
    .reduce((s, o) => s + o.amount, 0);
  const cash = getCashMetrics(operatingCost, activeTotal, totalMiles, loadedMiles);

  return (
    <div className="bg-plate rounded-lg p-4 mb-6">
      <p className="text-xs text-muted-text mb-1">
        Monthly obligations · cash out that's not on your P&amp;L
      </p>
      <p className="text-[11px] text-muted-text mb-3">
        Loan <span className="text-light">principal only</span> (not the full
        payment — interest is already counted on your P&amp;L), plus owner draws.
      </p>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <p className="text-xs text-muted-text">Obligations / mo</p>
          <p className="text-xl font-condensed mt-1">{money(activeTotal)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-text">True cash out / mo</p>
          <p className="text-xl font-condensed mt-1">
            {money(cash.trueMonthlyCost)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-text">True break-even RPM</p>
          <p className="text-xl font-condensed mt-1 text-amber">
            {cash.trueBreakEvenRpm == null
              ? "—"
              : `$${cash.trueBreakEvenRpm.toFixed(2)}`}
          </p>
        </div>
      </div>

      <table className="w-full text-sm">
        <tbody>
          {items.map((o) => (
            <tr key={o.obligation_id} className="border-t border-steel">
              <td className="py-2">
                {editing === o.obligation_id ? (
                  <input
                    className="bg-steel rounded px-2 py-1 w-full"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                  />
                ) : (
                  <span className={o.active ? "" : "opacity-40 line-through"}>
                    {o.label}
                  </span>
                )}
              </td>
              <td className="py-2 text-right w-28">
                {editing === o.obligation_id ? (
                  <input
                    className="bg-steel rounded px-2 py-1 w-24 text-right"
                    value={editAmt}
                    onChange={(e) => setEditAmt(e.target.value)}
                  />
                ) : (
                  money(o.amount)
                )}
              </td>
              <td className="py-2 text-right w-20">
                <div className="flex gap-3 justify-end text-muted-text">
                  {editing === o.obligation_id ? (
                    <Check
                      size={16}
                      className="cursor-pointer hover:text-light"
                      aria-label="Save"
                      onClick={() =>
                        run(async () => {
                          await patchObligation(o.obligation_id, {
                            label: editLabel,
                            amount: Number(editAmt),
                          });
                          setEditing(null);
                        })
                      }
                    />
                  ) : (
                    <Pencil
                      size={16}
                      className="cursor-pointer hover:text-light"
                      aria-label="Edit"
                      onClick={() => {
                        setEditing(o.obligation_id);
                        setEditLabel(o.label);
                        setEditAmt(String(o.amount));
                      }}
                    />
                  )}
                  <Trash2
                    size={16}
                    className="cursor-pointer hover:text-destructive"
                    aria-label="Delete"
                    onClick={() =>
                      !busy && run(() => deleteObligation(o.obligation_id))
                    }
                  />
                </div>
              </td>
            </tr>
          ))}
          {showAdd ? (
            <tr className="border-t border-steel">
              <td className="py-2">
                <input
                  placeholder="e.g. Truck lease"
                  className="bg-steel rounded px-2 py-1 w-full"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
              </td>
              <td className="py-2 text-right">
                <input
                  placeholder="0"
                  className="bg-steel rounded px-2 py-1 w-24 text-right"
                  value={newAmt}
                  onChange={(e) => setNewAmt(e.target.value)}
                />
              </td>
              <td className="py-2 text-right">
                <div className="flex gap-3 justify-end text-muted-text">
                  <Check
                    size={16}
                    className="cursor-pointer hover:text-light"
                    aria-label="Add"
                    onClick={() =>
                      newLabel &&
                      run(async () => {
                        await createObligation({
                          label: newLabel,
                          amount: Number(newAmt),
                        });
                        setNewLabel("");
                        setNewAmt("");
                        setShowAdd(false);
                      })
                    }
                  />
                  <X
                    size={16}
                    className="cursor-pointer hover:text-light"
                    aria-label="Cancel"
                    onClick={() => setShowAdd(false)}
                  />
                </div>
              </td>
            </tr>
          ) : (
            <tr>
              <td colSpan={3} className="py-2">
                <button
                  className="flex items-center gap-1 text-status-info-text"
                  onClick={() => setShowAdd(true)}
                >
                  <Plus size={16} /> Add obligation
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {error && <p className="text-destructive text-sm mt-2">{error}</p>}
    </div>
  );
};
