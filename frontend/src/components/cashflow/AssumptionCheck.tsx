// What your typed numbers are actually worth.
//
// Phase 1 of "Does the forecast hold?" (nodded 2026-11-09). The board already
// learns everywhere it has a feed; what never learns is the four figures typed
// once into Assumptions. This measures each against the statements already on
// the server and says which have gone stale.
//
// IT APPLIES NOTHING. Each row offers the swap and waits. A typed number
// chosen on purpose — a payroll about to change, a revenue figure deliberately
// conservative — is not an error, and software that quietly overwrites
// judgement is worse than software that never asks.
import { useMemo, useState } from "react";
import type { SettlementSummary } from "@/types/settlement";
import type { CashAssumptionsRow } from "@/services/cashflowService";
import { assumptionCheck, drift, type AssumptionRow } from "@/lib/metrics/assumptionCheck";
import { money } from "@/lib/format";
import { Panel } from "@/components/ui/Panel";

interface Props {
  settlements: SettlementSummary[];
  assumptions: CashAssumptionsRow | null;
  /** Writes the measured figure onto the assumption, then reloads. */
  onAdopt: (key: string, value: number) => Promise<void>;
}

const pct = (n: number): string => `${n > 0 ? "+" : "−"}${Math.abs(Math.round(n * 100))}%`;

export const AssumptionCheck = ({ settlements, assumptions, onAdopt }: Props) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const rows = useMemo<AssumptionRow[]>(() => {
    if (assumptions == null) return [];
    const n = (v: unknown): number | null => {
      const x = Number(v);
      return Number.isFinite(x) ? x : null;
    };
    return assumptionCheck({
      settlements,
      weeklyRevenue: n(assumptions.weekly_revenue),
      weeklyFuelAdvance: n(assumptions.weekly_fuel_advance),
      weeklyDeductions: n(assumptions.weekly_settlement_deductions),
      weeklyPayroll: n(assumptions.weekly_payroll),
    });
  }, [settlements, assumptions]);

  if (rows.length === 0) return null;
  const measured = rows.filter((r) => r.samples > 0);
  const stale = rows.filter((r) => r.verdict === "use");

  return (
    <Panel className="p-4 mt-4">
      <p className="ds2-label">
        Your assumptions, checked
        <span className="ml-2 normal-case tracking-normal text-faint font-normal">
          {measured.length === 0
            ? "no statements fed yet — nothing to check against"
            : `against your last ${measured[0].samples} statements`}
        </span>
      </p>

      {stale.length > 0 && (
        <p className="font-condensed text-[13.5px] text-dim mt-1.5">
          {stale.length === 1 ? "One typed number has" : `${stale.length} typed numbers have`} drifted
          from what your statements say. Nothing changes until you say so.
        </p>
      )}

      <div className="mt-2.5 divide-y ds2-cell-rule">
        {rows.map((r) => {
          const d = drift(r);
          const key = `a:${r.key}`;
          return (
            <div key={r.key} className="flex items-baseline gap-3 flex-wrap py-[9px]">
              <span className="font-condensed text-[13.5px] min-w-[150px]">
                {r.label}
                <span className="text-faint"> · {r.basis}</span>
              </span>

              <span className="font-condensed text-[13.5px] text-dim tabular-nums">
                you typed <b className="text-ink">{money(r.typed)}</b>
              </span>

              {r.measured != null ? (
                <span className="font-condensed text-[13.5px] text-dim tabular-nums">
                  your data says{" "}
                  <b style={{ color: r.verdict === "use" ? "var(--color-amber-hi)" : "var(--color-ink)" }}>
                    {money(r.measured)}
                  </b>
                  {d != null && Math.abs(d) >= 0.01 && (
                    <span className="text-faint"> ({pct(d)})</span>
                  )}
                </span>
              ) : (
                <span className="font-condensed text-[13px] text-faint">{r.note}</span>
              )}

              {r.lo != null && r.hi != null && (
                <span className="font-condensed text-[12.5px] text-faint tabular-nums">
                  {money(r.lo)}–{money(r.hi)}
                  {r.note && r.measured != null ? ` · ${r.note}` : ""}
                </span>
              )}

              <span className="ml-auto shrink-0">
                {r.verdict === "use" && r.measured != null ? (
                  <button
                    type="button"
                    disabled={busy === key}
                    onClick={() => {
                      setBusy(key);
                      setFailed(false);
                      onAdopt(r.key, r.measured!)
                        .catch(() => setFailed(true))
                        .finally(() => setBusy(null));
                    }}
                    className="font-condensed font-bold text-[11.5px] tracking-[.1em] uppercase px-3 h-8 rounded-[9px] bg-amber text-on-amber hover:brightness-105 whitespace-nowrap disabled:opacity-40"
                  >
                    {busy === key ? "…" : `Use ${money(r.measured)}`}
                  </button>
                ) : (
                  <span className="font-condensed text-[12px] text-faint">
                    {r.verdict === "close" ? "leave it" : "—"}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {failed && (
        <p
          className="font-condensed text-[12.5px] mt-2"
          style={{ color: "var(--color-status-negative-text)" }}
          role="alert"
        >
          That did not save. The typed figure is unchanged.
        </p>
      )}

      <p className="font-condensed text-[12px] text-faint mt-2.5 leading-snug">
        The board already learns wherever it has a feed — deposits prefer the
        real statement, fuel runs on your last four running weeks, deductions
        come off your statements. These four are the ones that only change when
        you change them.
      </p>
    </Panel>
  );
};
