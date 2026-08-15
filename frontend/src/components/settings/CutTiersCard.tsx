import { useEffect, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { money } from "@/lib/format";
import {
  getCutTierData,
  setCuttability,
  type CutTierRow,
} from "@/services/expensesService";
import { classifyCutTier, type CutTier } from "@/lib/metrics/cutPlanner";

const TIERS: { key: CutTier; label: string; color: string; blurb: string }[] = [
  { key: "off_limits", label: "Off-limits", color: "#5a6880", blurb: "never cut" },
  { key: "essential", label: "Essential", color: "#8494ab", blurb: "trim overspend only" },
  { key: "discretionary", label: "Discretionary", color: "#5dcaa5", blurb: "pare into it" },
  { key: "deferrable", label: "Deferrable", color: "#f5b03a", blurb: "defer a portion" },
  { key: "efficiency", label: "Efficiency", color: "#e8940a", blurb: "small slice" },
  { key: "last_resort", label: "Last resort", color: "#e24b4a", blurb: "your pay" },
];
const COLOR = Object.fromEntries(TIERS.map((t) => [t.key, t.color])) as Record<CutTier, string>;
const LABEL = Object.fromEntries(TIERS.map((t) => [t.key, t.label])) as Record<CutTier, string>;

const errText = (e: unknown): string =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
  "Something went wrong — try again.";

export const CutTiersCard = () => {
  const [rows, setRows] = useState<CutTierRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () =>
    getCutTierData()
      .then(setRows)
      .catch(() => setErr("Couldn't load your categories."));

  useEffect(() => {
    load();
  }, []);

  // Optimistic: reflect the change immediately, roll back on failure.
  const change = async (category: string, next: CutTier | null) => {
    setErr(null);
    const prevTier = rows?.find((r) => r.category === category)?.cuttability ?? null;
    setRows((rs) =>
      rs ? rs.map((r) => (r.category === category ? { ...r, cuttability: next } : r)) : rs,
    );
    try {
      await setCuttability(category, next);
    } catch (e) {
      setErr(errText(e));
      // Revert ONLY this category, so an overlapping successful edit isn't clobbered.
      setRows((rs) =>
        rs ? rs.map((r) => (r.category === category ? { ...r, cuttability: prevTier } : r)) : rs,
      );
    }
  };

  return (
    <Panel className="mt-6 max-w-[680px] p-5">
      <h2 className="text-lg font-medium text-light">Cost-cut tiers</h2>
      <p className="text-sm text-muted-text mt-1">
        When a soft market forces a cut, the Market playbook protects what it must and trims what
        it can. Each category is auto-sorted from its name — change any, and your choice sticks.
        This is the only place the plan's judgment lives.
      </p>

      <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3">
        {TIERS.map((t) => (
          <span key={t.key} className="inline-flex items-center gap-1.5 text-[11px] text-muted-text">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: t.color }} />
            <span className="text-light">{t.label}</span> {t.blurb}
          </span>
        ))}
      </div>

      {err && (
        <p className="text-sm text-red-400 mt-3">
          {err}{" "}
          <button type="button" onClick={load} className="underline hover:text-red-300">
            retry
          </button>
        </p>
      )}

      {rows == null ? (
        !err && <p className="text-sm text-muted-text mt-4">Loading your categories…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-text mt-4">
          No expense categories yet — they'll appear here once you've saved a P&amp;L month.
        </p>
      ) : (
        <div className="mt-4 divide-y divide-white/5">
          {rows.map((r) => {
            const auto = classifyCutTier(r.category);
            const effective = r.cuttability ?? auto;
            const overridden = r.cuttability != null;
            return (
              <div key={r.category} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-2.5">
                <div className="min-w-0">
                  <span className="text-sm text-light">{r.category}</span>
                  {overridden && (
                    <button
                      type="button"
                      onClick={() => change(r.category, null)}
                      className="ml-2 text-[10.5px] uppercase tracking-wide text-amber-400 hover:underline"
                      title={`Reset to auto (${LABEL[auto]})`}
                    >
                      edited · reset
                    </button>
                  )}
                </div>
                <span className="text-xs text-muted-text tabular-nums whitespace-nowrap">
                  {money(r.baseline)}/mo
                </span>
                <div className="relative">
                  <span
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full"
                    style={{ background: COLOR[effective] }}
                  />
                  <select
                    value={effective}
                    aria-label={`Cost-cut tier for ${r.category}`}
                    onChange={(e) => change(r.category, e.target.value as CutTier)}
                    className="appearance-none bg-steel rounded-lg pl-6 pr-7 py-1.5 text-light text-xs w-[168px] cursor-pointer"
                  >
                    {TIERS.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-text text-[10px]">
                    ▾
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
};
