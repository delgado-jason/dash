import { Panel } from "@/components/ui/Panel";
import { FetchFailed } from "@/components/integrity/FetchFailed";
import { MissingInputLine } from "@/components/integrity/MissingInput";
import { FIX_SNAPSHOT, type PlanStatus } from "@/lib/metrics/planStatus";
import type { PlanRow, PlanStageRow, SnapshotRow } from "@/services/planService";
import type { LeaveReserve } from "@/lib/metrics/leaveReserve";
import type { SitRun } from "@/lib/metrics/sitRun";
import type { Obligation } from "@/types/obligation";
import type { MissingInput } from "@/lib/integrity/require";
import { floorViews, stageView, truckFreeAndClear, monthYear } from "@/lib/metrics/stageCard";
import { money } from "@/lib/format";
import { dayWords } from "./words";

const FLOOR_NAME = { ops: "Ops", maintenance: "Maintenance", vault: "Vault" } as const;

const Loading = () => <p className="font-condensed text-[26px] leading-none mt-1.5 text-faint">…</p>;

// BAND 4 · The floors — the three interlock floors in fill order, the Plan
// page's own figures (status = getPlanStatus on the latest snapshot).
export const FloorsCard = ({
  status,
  plan,
  latest,
  taxBalance,
  opsCheckDate,
  loading,
  failed,
  retry,
}: {
  status: PlanStatus | null;
  plan: PlanRow | null;
  latest: SnapshotRow | null;
  taxBalance: number | null;
  opsCheckDate: string | null;
  loading: boolean;
  failed: string[];
  retry: () => void;
}) => {
  const floors = floorViews(status);
  const taxMissing: MissingInput = { key: "balance_tax", label: "the Tax balance", fixAt: FIX_SNAPSHOT, fixTo: "/status" };
  const noSnapshot: MissingInput = { key: "snapshot", label: "a Friday snapshot", fixAt: FIX_SNAPSHOT, fixTo: "/status" };
  const noPlan: MissingInput = { key: "plan", label: "the plan", fixAt: "EDIT PLAN", fixTo: "/status" };
  return (
    <Panel className="p-4 h-full" data-testid="floors-card">
      <p className="ds2-label">The floors</p>
      {loading ? (
        <Loading />
      ) : failed.length > 0 && !status ? (
        <FetchFailed what={failed.join(", ")} onRetry={retry} className="mt-2" />
      ) : !floors ? (
        <MissingInputLine what="show the floors" missing={[!plan ? noPlan : noSnapshot]} className="block mt-2" />
      ) : (
        <>
          <ul className="mt-2 space-y-2">
            {floors.map((f) => (
              <li key={f.key}>
                <div className="flex items-baseline gap-2">
                  <span className="text-[12px] font-semibold text-ink w-[92px]">{FLOOR_NAME[f.key]}</span>
                  {f.balance != null && f.floor != null ? (
                    <>
                      <span className="font-condensed font-semibold text-[15px] tabular-nums text-ink">{money(f.balance)}</span>
                      <span className="text-[11.5px] text-faint tabular-nums">of {money(f.floor)} floor</span>
                      <span className={`ml-auto text-[12px] font-semibold tabular-nums ${f.met ? "text-status-positive-text" : "text-status-negative-text"}`}>
                        {f.pct}%
                      </span>
                    </>
                  ) : (
                    <MissingInputLine what="read this floor" missing={f.missing} />
                  )}
                </div>
                {f.pct != null && (
                  <div className="h-[4px] rounded-[2px] bg-well mt-1 overflow-hidden">
                    <div className={`h-full ${f.met ? "bg-status-positive-text" : "bg-amber"}`} style={{ width: `${f.pct}%` }} />
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="text-[11.5px] text-faint mt-3">
            {taxBalance != null ? (
              <>Tax set aside <b className="text-ink tabular-nums">{money(taxBalance)}</b></>
            ) : (
              <MissingInputLine what="show the tax set aside" missing={[taxMissing]} />
            )}
            {latest && <> · {dayWords(latest.as_of)} snapshot</>}
            {opsCheckDate && <> · Ops from OPS NOW {dayWords(opsCheckDate)}</>}
          </p>
        </>
      )}
    </Panel>
  );
};

// BAND 4 · The stage — the active rung of the plan's waterfall, and the date the
// truck is free and clear. A payoff that can't be dated names why.
export const StageCard = ({
  status,
  plan,
  obligById,
  obligations,
  now,
  loading,
  failed,
  retry,
}: {
  status: PlanStatus | null;
  plan: PlanRow | null;
  obligById: Map<string, Obligation> | null;
  obligations: Obligation[];
  now: Date;
  loading: boolean;
  failed: string[];
  retry: () => void;
}) => {
  const v = stageView(status, plan, obligById, now);
  const truck = truckFreeAndClear(obligations, now);
  return (
    <Panel className="p-4 h-full" data-testid="stage-card">
      <p className="ds2-label">The stage</p>
      {loading ? (
        <Loading />
      ) : failed.length > 0 && !status ? (
        <FetchFailed what={failed.join(", ")} onRetry={retry} className="mt-2" />
      ) : v.kind === "refused" ? (
        <MissingInputLine what={v.what} missing={v.missing} className="block mt-2" />
      ) : v.kind === "complete" ? (
        <p className="text-[13px] text-status-positive-text mt-2">All {v.total} stages are done.</p>
      ) : (
        <>
          <p className="font-condensed font-semibold text-[18px] leading-tight mt-1.5 text-ink">
            Stage {v.n} of {v.total} · {v.label}
          </p>
          {v.kind === "obligation" ? (
            <div className="text-[12px] text-faint mt-1.5 space-y-0.5">
              <p>
                {v.left != null ? (
                  <><b className="text-ink tabular-nums">{money(v.left)}</b> left{v.asOf ? ` · balance as of ${dayWords(v.asOf)}` : ""}</>
                ) : (
                  <span className="text-hot">no obligation is bound to this stage — bind one on the Plan page</span>
                )}
                {v.draft != null && <> · {money(v.draft)} a month</>}
              </p>
              {v.left != null && <p>
                {v.payoff == null ? (
                  <span className="text-hot">payoff date unknown: no obligation is bound to this stage — bind one on the Plan page</span>
                ) : v.payoff.ok ? (
                  <>{v.payoff.exact ? "payoff" : "on pace to pay off"} <b className="text-ink">{monthYear(v.payoff.date)}</b></>
                ) : (
                  <span className="text-hot">payoff date unknown: {v.payoff.reason}</span>
                )}
              </p>}
            </div>
          ) : (
            <p className="text-[12px] text-faint mt-1.5">
              {v.current != null ? <b className="text-ink tabular-nums">{money(v.current)}</b> : <span className="text-hot">no balance typed</span>}
              {v.target != null && <> against <b className="text-ink tabular-nums">{money(v.target)}</b> target</>}
            </p>
          )}
        </>
      )}
      {!loading && failed.length === 0 && (
        <p className={`text-[12px] mt-3 ${truck.ok ? "text-dim" : "text-hot"}`}>{truck.text}</p>
      )}
    </Panel>
  );
};

// BAND 4 · Leave reserve — the Vault in weeks of a parked truck against the
// plan's horizon (lib/metrics/leaveReserve). Every input is one the app already
// stores; a missing one is named with where to set it, never read as zero.
export const LeaveCard = ({
  reserve,
  vault,
  weeks,
  sit,
  weeklyPayroll,
  cushion,
  loading,
  failed,
  retry,
}: {
  reserve: LeaveReserve;
  vault: number | null;
  weeks: number | null;
  sit: SitRun | null;
  weeklyPayroll: number | null;
  cushion: PlanStageRow | null; // the plan's far vault rung, when it has one
  loading: boolean;
  failed: string[];
  retry: () => void;
}) => {
  const pct = reserve.pct == null ? null : Math.max(0, Math.min(100, Math.round(reserve.pct * 100)));
  return (
    <Panel className="p-4 h-full" data-testid="leave-card">
      <p className="ds2-label">Leave reserve</p>
      {loading ? (
        <Loading />
      ) : failed.length > 0 && reserve.weeklyBurn == null ? (
        <FetchFailed what={failed.join(", ")} onRetry={retry} className="mt-2" />
      ) : reserve.missing.length > 0 ? (
        <MissingInputLine what="price a parked week" missing={reserve.missing} className="block mt-2" />
      ) : (
        <>
          <p className="font-condensed font-semibold text-[22px] leading-tight mt-1.5 text-ink tabular-nums">
            {(reserve.weeksCovered ?? 0).toFixed(1)} wk <span className="text-[13px] text-faint font-normal">of {weeks}</span>
          </p>
          {pct != null && (
            <div className="h-[6px] rounded-[3px] bg-well mt-2 overflow-hidden" role="img" aria-label={`${pct}% of the leave target is in the Vault`}>
              <div className="h-full bg-amber" style={{ width: `${pct}%` }} />
            </div>
          )}
          <p className="text-[12px] text-faint mt-2 leading-snug">
            Vault <b className="text-ink tabular-nums">{money(vault ?? 0)}</b> · a parked week ≈{" "}
            <b className="text-ink tabular-nums">{money(reserve.weeklyBurn ?? 0)}</b>: payroll {money(weeklyPayroll ?? 0)} + fixed costs and notes ≈{" "}
            {money(sit?.sitWeekly ?? 0)} · {weeks} weeks ≈ {money(reserve.target ?? 0)}
            {cushion ? <> · the Plan's {cushion.label}: {money(Number(cushion.target_lo))}</> : null}
          </p>
        </>
      )}
    </Panel>
  );
};
