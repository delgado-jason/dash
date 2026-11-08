import { Panel } from "@/components/ui/Panel";
import { FetchFailed } from "@/components/integrity/FetchFailed";
import { MissingInputLine } from "@/components/integrity/MissingInput";
import { FIX_SNAPSHOT, type PlanStatus } from "@/lib/metrics/planStatus";
import type { PlanRow, SnapshotRow } from "@/services/planService";
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
                  <span className="text-hot">no balance is bound to this stage — bind an obligation on the Plan page</span>
                )}
                {v.draft != null && <> · {money(v.draft)} a month</>}
              </p>
              <p>
                {v.payoff == null ? (
                  <span className="text-hot">payoff date unknown: no obligation is bound to this stage — bind one on the Plan page</span>
                ) : v.payoff.ok ? (
                  <>{v.payoff.exact ? "payoff" : "on pace to pay off"} <b className="text-ink">{monthYear(v.payoff.date)}</b></>
                ) : (
                  <span className="text-hot">payoff date unknown: {v.payoff.reason}</span>
                )}
              </p>
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
