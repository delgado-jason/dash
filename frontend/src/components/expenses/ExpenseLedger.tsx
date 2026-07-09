import { Fragment, useState } from "react";
import { ArrowLeftRight, Pencil, Check, Trash2, Plus, X } from "lucide-react";
import type { ExpensePeriod, ExpenseType } from "@/types/expense";
import {
  patchExpenseLine,
  deleteExpenseLine,
  addExpenseLine,
} from "@/services/expensesService";

interface Props {
  period: ExpensePeriod;
  totalMiles: number;
  income: number | null;
  onChange: () => void;
}

const money = (n: number): string =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const perMile = (n: number | null): string => (n == null ? "—" : `$${n.toFixed(2)}`);
const pct = (n: number | null): string => (n == null ? "—" : `${(n * 100).toFixed(0)}%`);

export const ExpenseLedger = ({ period, totalMiles, income, onChange }: Props) => {
  const lines = period.lines ?? [];
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [newAmt, setNewAmt] = useState("");
  const [newType, setNewType] = useState<ExpenseType>("variable");

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

  const group = (type: ExpenseType) => lines.filter((l) => l.type === type);
  const subtotal = (type: ExpenseType) =>
    group(type).reduce((s, l) => s + l.amount, 0);

  const renderGroup = (type: ExpenseType, label: string) => (
    <Fragment>
      <tr className="bg-plate font-semibold">
        <td className="p-2">{label}</td>
        <td className="p-2 text-right">{money(subtotal(type))}</td>
        <td />
        <td />
        <td />
      </tr>
      {group(type).map((l) => (
        <tr key={l.line_id} className="border-t border-steel">
          <td className="p-2">{l.category}</td>
          <td className="p-2 text-right">
            {editing === l.line_id ? (
              <input
                className="w-20 bg-steel border border-amber rounded px-1 text-right"
                value={editVal}
                onChange={(e) => setEditVal(e.target.value)}
              />
            ) : (
              money(l.amount)
            )}
          </td>
          <td className="p-2 text-right text-muted-text">
            {perMile(totalMiles > 0 ? l.amount / totalMiles : null)}
          </td>
          <td className="p-2 text-right text-muted-text">
            {pct(income && income > 0 ? l.amount / income : null)}
          </td>
          <td className="p-2 text-right">
            <div className="flex gap-3 justify-end text-muted-text">
              <ArrowLeftRight
                size={16}
                className="cursor-pointer hover:text-light"
                aria-label={`Move to ${l.type === "fixed" ? "variable" : "fixed"}`}
                onClick={() =>
                  !busy &&
                  run(() =>
                    patchExpenseLine(l.line_id, {
                      type: l.type === "fixed" ? "variable" : "fixed",
                    }),
                  )
                }
              />
              {editing === l.line_id ? (
                <Check
                  size={16}
                  className="cursor-pointer hover:text-light"
                  aria-label="Save"
                  onClick={() =>
                    run(async () => {
                      await patchExpenseLine(l.line_id, {
                        amount: Number(editVal),
                      });
                      setEditing(null);
                    })
                  }
                />
              ) : (
                <Pencil
                  size={16}
                  className="cursor-pointer hover:text-light"
                  aria-label="Edit value"
                  onClick={() => {
                    setEditing(l.line_id);
                    setEditVal(String(l.amount));
                  }}
                />
              )}
              <Trash2
                size={16}
                className="cursor-pointer hover:text-destructive"
                aria-label="Delete"
                onClick={() => !busy && run(() => deleteExpenseLine(l.line_id))}
              />
            </div>
          </td>
        </tr>
      ))}
    </Fragment>
  );

  return (
    <>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-text text-xs text-left">
            <th className="p-2 font-normal">Expense</th>
            <th className="p-2 font-normal text-right">Amount</th>
            <th className="p-2 font-normal text-right">$/mi</th>
            <th className="p-2 font-normal text-right">% rev</th>
            <th className="p-2 font-normal text-right w-24"></th>
          </tr>
        </thead>
        <tbody>
          {renderGroup("fixed", "Fixed")}
          {renderGroup("variable", "Variable")}
          {showAdd ? (
            <tr className="border-t border-steel">
              <td className="p-2">
                <input
                  placeholder="Category"
                  className="w-full bg-steel rounded px-2 py-1"
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                />
              </td>
              <td className="p-2">
                <input
                  placeholder="0"
                  className="w-20 bg-steel rounded px-2 py-1 text-right"
                  value={newAmt}
                  onChange={(e) => setNewAmt(e.target.value)}
                />
              </td>
              <td className="p-2" colSpan={2}>
                <select
                  className="bg-steel rounded px-2 py-1"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as ExpenseType)}
                >
                  <option value="fixed">Fixed</option>
                  <option value="variable">Variable</option>
                </select>
              </td>
              <td className="p-2 text-right">
                <div className="flex gap-3 justify-end text-muted-text">
                  <Check
                    size={16}
                    className="cursor-pointer hover:text-light"
                    aria-label="Add expense"
                    onClick={() =>
                      newCat &&
                      run(async () => {
                        await addExpenseLine(period.period_id, {
                          category: newCat,
                          amount: Number(newAmt),
                          type: newType,
                          section: "expenses",
                        });
                        setNewCat("");
                        setNewAmt("");
                        setShowAdd(false);
                      })
                    }
                  />
                  <X
                    size={16}
                    className="cursor-pointer hover:text-light"
                    aria-label="Cancel"
                    onClick={() => {
                      setShowAdd(false);
                      setNewCat("");
                      setNewAmt("");
                    }}
                  />
                </div>
              </td>
            </tr>
          ) : (
            <tr>
              <td colSpan={5} className="p-2">
                <button
                  className="flex items-center gap-1 text-status-info-text"
                  onClick={() => setShowAdd(true)}
                >
                  <Plus size={16} /> Add expense
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {error && <p className="text-destructive text-sm mt-2">{error}</p>}
    </>
  );
};
