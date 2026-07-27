import { Fragment, useState } from "react";
import { Pencil, Trash2, Check, X, Plus, Eye, EyeOff, HandCoins } from "lucide-react";
import type { Obligation } from "@/types/obligation";
import {
  createObligation,
  patchObligation,
  deleteObligation,
} from "@/services/obligationsService";
import { Panel } from "@/components/ui/Panel";

interface Props {
  items: Obligation[];
  onChange: () => void; // refetch at the page level after a mutation
}

const money = (n: number): string =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

// Manages the obligations list. Their dollar/break-even impact now shows in the
// page's headline KPIs (obligations are folded into true cost); this card is
// where the list is edited, with a running monthly total. Toggle an obligation
// inactive (the eye) to drop it from the numbers without deleting it.
export const ObligationsCard = ({ items, onChange }: Props) => {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editAmt, setEditAmt] = useState("");
  // Payoff / loan tracking on the obligation being edited.
  const [editOrig, setEditOrig] = useState("");
  const [editBal, setEditBal] = useState("");
  const [editPayoff, setEditPayoff] = useState("");
  const [editAsset, setEditAsset] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newAmt, setNewAmt] = useState("");

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const activeTotal = items
    .filter((o) => o.active)
    .reduce((s, o) => s + o.amount, 0);

  return (
    <Panel noir className="p-4 mb-6">
      <div className="flex justify-between items-start mb-1">
        <p className="text-xs text-muted-text">
          Monthly obligations · cash out that's not on your P&amp;L
        </p>
        <p className="text-sm">
          <span className="text-muted-text">Obligations / mo </span>
          <span className="font-condensed">{money(activeTotal)}</span>
        </p>
      </div>
      <p className="text-[11px] text-muted-text mb-3">
        Loan <span className="text-light">principal only</span> (not the full
        payment — interest is already counted on your P&amp;L), plus owner draws.
        These fold into the true cost in the KPIs above; toggle one inactive to
        see the numbers without it. Mark an owner draw (hand icon) to keep it out
        of your card's True Net — it still counts toward break-even here.
      </p>

      <table className="w-full text-sm">
        <tbody>
          {items.map((o) => (
            <Fragment key={o.obligation_id}>
            <tr className="border-t border-steel">
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
                    {o.is_draw && (
                      <span className="text-[10px] text-amber ml-1.5 align-middle">
                        draw
                      </span>
                    )}
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
                  <span className={o.active ? "" : "opacity-40"}>
                    {money(o.amount)}
                  </span>
                )}
              </td>
              <td className="py-2 text-right w-28">
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
                            original_balance: editOrig ? Number(editOrig) : null,
                            current_balance: editBal ? Number(editBal) : null,
                            payoff_date: editPayoff || null,
                            asset_type: editAsset || null,
                          });
                          setEditing(null);
                        })
                      }
                    />
                  ) : (
                    <>
                      {o.active ? (
                        <Eye
                          size={16}
                          className="cursor-pointer hover:text-light"
                          aria-label="Counted — click to exclude"
                          onClick={() =>
                            !busy &&
                            run(() =>
                              patchObligation(o.obligation_id, { active: false }),
                            )
                          }
                        />
                      ) : (
                        <EyeOff
                          size={16}
                          className="cursor-pointer hover:text-light opacity-50"
                          aria-label="Excluded — click to count"
                          onClick={() =>
                            !busy &&
                            run(() =>
                              patchObligation(o.obligation_id, { active: true }),
                            )
                          }
                        />
                      )}
                      <HandCoins
                        size={16}
                        className={`cursor-pointer ${o.is_draw ? "text-amber" : "hover:text-light opacity-50"}`}
                        aria-label={
                          o.is_draw
                            ? "Owner draw — kept out of True Net (click to unmark)"
                            : "Mark as owner draw (excluded from True Net)"
                        }
                        onClick={() =>
                          !busy &&
                          run(() =>
                            patchObligation(o.obligation_id, {
                              is_draw: !o.is_draw,
                            }),
                          )
                        }
                      />
                      <Pencil
                        size={16}
                        className="cursor-pointer hover:text-light"
                        aria-label="Edit"
                        onClick={() => {
                          setEditing(o.obligation_id);
                          setEditLabel(o.label);
                          setEditAmt(String(o.amount));
                          setEditOrig(
                            o.original_balance != null ? String(o.original_balance) : "",
                          );
                          setEditBal(
                            o.current_balance != null ? String(o.current_balance) : "",
                          );
                          setEditPayoff(o.payoff_date ? o.payoff_date.slice(0, 10) : "");
                          setEditAsset(o.asset_type ?? "");
                        }}
                      />
                    </>
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
            {editing === o.obligation_id && !o.is_draw && (
              <tr>
                <td colSpan={3} className="pb-3">
                  <div className="rounded bg-steel/50 p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <label className="text-[11px] text-muted-text">
                      Original $
                      <input
                        className="bg-steel rounded px-2 py-1 w-full mt-0.5 text-light"
                        value={editOrig}
                        onChange={(e) => setEditOrig(e.target.value)}
                        placeholder="0"
                      />
                    </label>
                    <label className="text-[11px] text-muted-text">
                      Current balance $
                      <input
                        className="bg-steel rounded px-2 py-1 w-full mt-0.5 text-light"
                        value={editBal}
                        onChange={(e) => setEditBal(e.target.value)}
                        placeholder="0"
                      />
                    </label>
                    <label className="text-[11px] text-muted-text">
                      Payoff / end date
                      <input
                        type="date"
                        className="bg-steel rounded px-2 py-1 w-full mt-0.5 text-light"
                        value={editPayoff}
                        onChange={(e) => setEditPayoff(e.target.value)}
                      />
                    </label>
                    <label className="text-[11px] text-muted-text">
                      Tracks asset
                      <select
                        className="bg-steel rounded px-2 py-1 w-full mt-0.5 text-light"
                        value={editAsset}
                        onChange={(e) => setEditAsset(e.target.value)}
                      >
                        <option value="">Not tracked</option>
                        <option value="truck">Truck</option>
                        <option value="trailer">Trailer</option>
                      </select>
                    </label>
                  </div>
                  <p className="text-[10px] text-muted-text mt-1.5">
                    Fill these to show a payoff tracker on the asset's page. Leave the
                    date blank to estimate at your payment pace; $0 auto-earns the trophy.
                  </p>
                </td>
              </tr>
            )}
            </Fragment>
          ))}
          {showAdd ? (
            <tr className="border-t border-steel">
              <td className="py-2">
                <input
                  placeholder="e.g. Truck loan principal"
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
    </Panel>
  );
};
