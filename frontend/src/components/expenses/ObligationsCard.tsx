import { Fragment, useState } from "react";
import type { Obligation } from "@/types/obligation";
import {
  createObligation,
  patchObligation,
  deleteObligation,
} from "@/services/obligationsService";
import { money } from "@/lib/format";
import { isPayoffTracked, computePayoff } from "@/lib/metrics/payoff";

interface Props {
  items: Obligation[];
  onChange: () => void; // refetch at the page level after a mutation
}

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

  const now = new Date();

  return (
    <div className="ds2-board p-4 mt-4">
      <div className="flex justify-between items-start mb-1 gap-3 flex-wrap">
        <p className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
          The notes · cash out that's not on your P&L
        </p>
        <p className="font-condensed text-sm">
          <span className="text-faint">monthly </span>
          <span className="font-semibold tabular-nums">{money(activeTotal)}</span>
        </p>
      </div>
      <p className="text-[11px] text-faint mb-3">
        Loan <span className="text-ink">principal only</span> (not the full
        payment — interest is already counted on your P&amp;L), plus owner draws.
        These fold into the true cost in the KPIs above; toggle one inactive to
        see the numbers without it. Mark an owner draw (hand icon) to keep it out
        of your card's True Net — it still counts toward break-even here.
      </p>

      <table className="w-full text-sm">
        <tbody>
          {items.map((o) => (
            <Fragment key={o.obligation_id}>
            <tr className="border-t border-hairline-lo">
              <td className="py-2">
                {editing === o.obligation_id ? (
                  <input
                    className="bg-well rounded px-2 py-1 w-full"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                  />
                ) : (
                  <span className={o.active ? "" : "opacity-40 line-through"}>
                    {o.label}
                    {o.is_draw && (
                      <span className="font-condensed font-bold text-[10px] tracking-[.1em] text-amber-hi ml-1.5 align-middle">
                        DRAW
                      </span>
                    )}
                    {isPayoffTracked(o) &&
                      (() => {
                        const pay = computePayoff(o, now);
                        return pay.paidPct != null ? (
                          <span className="flex items-center gap-2 mt-1">
                            <span className="inline-flex gap-[2px] w-[110px]">
                              {Array.from({ length: 10 }, (_, ci) => (
                                <i
                                  key={ci}
                                  className="flex-1 h-[6px] rounded-[2px]"
                                  style={
                                    (ci + 1) / 10 <= (pay.paidPct ?? 0) + 1e-6
                                      ? {
                                          background:
                                            "linear-gradient(180deg, var(--color-hot), var(--color-amber))",
                                        }
                                      : {
                                          background: "var(--color-well)",
                                          border: "1px solid var(--color-hairline-lo)",
                                        }
                                  }
                                />
                              ))}
                            </span>
                            <span className="font-condensed text-[10.5px] text-faint tabular-nums">
                              {Math.round((pay.paidPct ?? 0) * 100)}% ·{" "}
                              {money(pay.owed)} to go
                            </span>
                          </span>
                        ) : null;
                      })()}
                  </span>
                )}
              </td>
              <td className="py-2 text-right w-28">
                {editing === o.obligation_id ? (
                  <input
                    className="bg-well rounded px-2 py-1 w-24 text-right"
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
                <div className="flex gap-3 justify-end text-faint">
                  {editing === o.obligation_id ? (
                    <button
                      className="font-condensed font-semibold text-[10.5px] tracking-[.08em] text-amber-hi"
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
                    >
                      SAVE
                    </button>
                  ) : (
                    <>
                      <button
                        className="font-condensed font-semibold text-[10.5px] tracking-[.08em] hover:text-ink"
                        aria-label={o.active ? "Counted — click to exclude" : "Excluded — click to count"}
                        onClick={() =>
                          !busy &&
                          run(() =>
                            patchObligation(o.obligation_id, { active: !o.active }),
                          )
                        }
                      >
                        {o.active ? "HIDE" : "SHOW"}
                      </button>
                      <button
                        className={`font-condensed font-semibold text-[10.5px] tracking-[.08em] ${o.is_draw ? "text-amber-hi" : "opacity-60 hover:text-ink"}`}
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
                      >
                        DRAW
                      </button>
                      <button
                        className="font-condensed font-semibold text-[10.5px] tracking-[.08em] hover:text-ink"
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
                      >
                        EDIT
                      </button>
                    </>
                  )}
                  <button
                    className="hover:text-[#e05252]"
                    aria-label="Delete"
                    onClick={() =>
                      !busy && run(() => deleteObligation(o.obligation_id))
                    }
                  >
                    ✕
                  </button>
                </div>
              </td>
            </tr>
            {editing === o.obligation_id && !o.is_draw && (
              <tr>
                <td colSpan={3} className="pb-3">
                  <div className="rounded bg-well/60 p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <label className="text-[11px] text-faint">
                      Original $
                      <input
                        className="bg-well rounded px-2 py-1 w-full mt-0.5 text-ink"
                        value={editOrig}
                        onChange={(e) => setEditOrig(e.target.value)}
                        placeholder="0"
                      />
                    </label>
                    <label className="text-[11px] text-faint">
                      Current balance $
                      <input
                        className="bg-well rounded px-2 py-1 w-full mt-0.5 text-ink"
                        value={editBal}
                        onChange={(e) => setEditBal(e.target.value)}
                        placeholder="0"
                      />
                    </label>
                    <label className="text-[11px] text-faint">
                      Payoff / end date
                      <input
                        type="date"
                        className="bg-well rounded px-2 py-1 w-full mt-0.5 text-ink"
                        value={editPayoff}
                        onChange={(e) => setEditPayoff(e.target.value)}
                      />
                    </label>
                    <label className="text-[11px] text-faint">
                      Tracks asset
                      <select
                        className="bg-well rounded px-2 py-1 w-full mt-0.5 text-ink"
                        value={editAsset}
                        onChange={(e) => setEditAsset(e.target.value)}
                      >
                        <option value="">Not tracked</option>
                        <option value="truck">Truck</option>
                        <option value="trailer">Trailer</option>
                      </select>
                    </label>
                  </div>
                  <p className="text-[10px] text-faint mt-1.5">
                    Fill these to show a payoff tracker on the asset's page. Leave the
                    date blank to estimate at your payment pace; $0 auto-earns the trophy.
                  </p>
                </td>
              </tr>
            )}
            </Fragment>
          ))}
          {showAdd ? (
            <tr className="border-t border-hairline-lo">
              <td className="py-2">
                <input
                  placeholder="e.g. Truck loan principal"
                  className="bg-well rounded px-2 py-1 w-full"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
              </td>
              <td className="py-2 text-right">
                <input
                  placeholder="0"
                  className="bg-well rounded px-2 py-1 w-24 text-right"
                  value={newAmt}
                  onChange={(e) => setNewAmt(e.target.value)}
                />
              </td>
              <td className="py-2 text-right">
                <div className="flex gap-3 justify-end text-faint">
                  <button
                    className="font-condensed font-semibold text-[10.5px] tracking-[.08em] text-amber-hi"
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
                  >
                    ADD
                  </button>
                  <button
                    className="hover:text-ink"
                    aria-label="Cancel"
                    onClick={() => setShowAdd(false)}
                  >
                    ✕
                  </button>
                </div>
              </td>
            </tr>
          ) : (
            <tr>
              <td colSpan={3} className="py-2">
                <button
                  className="font-condensed font-semibold text-[12.5px] tracking-[.06em] text-amber-hi hover:text-hot"
                  onClick={() => setShowAdd(true)}
                >
                  + ADD NOTE
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
