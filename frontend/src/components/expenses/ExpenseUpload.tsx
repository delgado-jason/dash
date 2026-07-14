import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  parsePnlFile,
  type ProposedPeriod,
  type ProposedLine,
} from "@/lib/pnl/parseFile";
import {
  getCategoryDefaults,
  saveExpensePeriod,
} from "@/services/expensesService";
import type { ExpenseType } from "@/types/expense";
import { Panel } from "@/components/ui/Panel";

interface Props {
  onSaved: () => void;
  onCancel: () => void;
}

const money = (n: number | null): string =>
  n == null ? "—" : `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export const ExpenseUpload = ({ onSaved, onCancel }: Props) => {
  const [proposed, setProposed] = useState<ProposedPeriod | null>(null);
  const [lines, setLines] = useState<ProposedLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const defaults = await getCategoryDefaults();
      const parsed = await parsePnlFile(file, defaults);
      if (!parsed.period_month) {
        setError("Couldn't read the month from this file.");
        return;
      }
      setProposed(parsed);
      setLines(parsed.lines);
    } catch {
      setError("Couldn't parse this file. Is it a QuickBooks P&L CSV?");
    }
  };

  const updateLine = (i: number, patch: Partial<ProposedLine>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) =>
    setLines((ls) => ls.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!proposed?.period_month) return;
    setSaving(true);
    setError(null);
    try {
      await saveExpensePeriod({
        period_month: proposed.period_month,
        period_label: proposed.period_label,
        income_total: proposed.income_total,
        cogs_total: proposed.cogs_total,
        expense_total: proposed.expense_total,
        lines: lines.map((l) => ({
          category: l.category,
          amount: Number(l.amount),
          type: l.type,
          section: l.section,
        })),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel className="p-4 mb-6">
      {!proposed ? (
        <div>
          <p className="text-sm text-light mb-2">
            Upload a monthly P&amp;L (QuickBooks CSV)
          </p>
          <input
            type="file"
            accept=".csv"
            onChange={onFile}
            className="text-sm text-muted-text"
          />
        </div>
      ) : (
        <div>
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm text-light">Confirm · {proposed.period_label}</p>
            <span className="text-xs text-muted-text">
              Income {money(proposed.income_total)} · Cost{" "}
              {money((proposed.cogs_total ?? 0) + (proposed.expense_total ?? 0))}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-text text-xs text-left">
                <th className="p-1 font-normal">Category</th>
                <th className="p-1 font-normal">Amount</th>
                <th className="p-1 font-normal">Type</th>
                <th className="p-1"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-t border-steel">
                  <td className="p-1">{l.category}</td>
                  <td className="p-1">
                    <input
                      className="w-20 bg-steel rounded px-1 text-right"
                      value={String(l.amount)}
                      onChange={(e) =>
                        updateLine(i, { amount: Number(e.target.value) })
                      }
                    />
                  </td>
                  <td className="p-1">
                    <select
                      className="bg-steel rounded px-1"
                      value={l.type}
                      onChange={(e) =>
                        updateLine(i, { type: e.target.value as ExpenseType })
                      }
                    >
                      <option value="fixed">Fixed</option>
                      <option value="variable">Variable</option>
                    </select>
                  </td>
                  <td className="p-1 text-right">
                    <Trash2
                      size={16}
                      className="cursor-pointer text-muted-text inline"
                      aria-label="Remove"
                      onClick={() => removeLine(i)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-2 mt-3">
            <button
              className="bg-amber text-steel px-3 py-1 rounded text-sm font-semibold disabled:opacity-60"
              onClick={save}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save month"}
            </button>
            <button className="text-muted-text px-3 py-1 text-sm" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-destructive text-sm mt-2">{error}</p>}
    </Panel>
  );
};
