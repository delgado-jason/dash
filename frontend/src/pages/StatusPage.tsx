import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getPlans,
  createPlan,
  patchPlan,
  createStage,
  patchStage,
  deleteStage,
  getSnapshots,
  createSnapshot,
  type PlanRow,
  type PlanStageRow,
  type SnapshotRow,
} from "@/services/planService";
import { getObligations } from "@/services/obligationsService";
import type { Obligation } from "@/types/obligation";
import {
  getPlanStatus,
  type PlanStageInput,
  type SnapshotInput,
} from "@/lib/metrics/planStatus";
import { money, formatDate } from "@/lib/format";

// The Friday ritual: snapshot FIRST (raw balances), then the page hands out
// the orders — the sweep, and where the overflow goes. The plan is a
// framework: stages/targets are rows, 2028 is a new plan, not new code.

const num = (v: string | number | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const todayKey = () => new Date().toLocaleDateString("en-CA");

const Cells = ({
  pct,
  cells = 12,
  dim = false,
  hot = false,
}: {
  pct: number;
  cells?: number;
  dim?: boolean;
  hot?: boolean;
}) => (
  <div className="flex gap-[3px]">
    {Array.from({ length: cells }, (_, i) => {
      const on = (i + 1) / cells <= pct + 1e-6;
      return (
        <i
          key={i}
          className="flex-1 h-[9px] rounded-[2px]"
          style={
            on
              ? {
                  background: hot
                    ? "linear-gradient(180deg, #ff8a8a, #e05252)"
                    : "linear-gradient(180deg, var(--color-hot), var(--color-amber))",
                  border: "1px solid rgba(245,176,58,.5)",
                  opacity: dim ? 0.35 : 1,
                }
              : {
                  background: "var(--color-well)",
                  border: "1px solid var(--color-hairline-lo)",
                  boxShadow: "inset 0 2px 3px rgba(0,0,0,.55)",
                }
          }
        />
      );
    })}
  </div>
);

const FIELD =
  "h-9 w-full rounded-[9px] bg-well border border-hairline px-3 font-condensed text-[14px] text-ink outline-none";
const LBL = "font-condensed font-semibold text-[11px] tracking-[.12em] uppercase text-faint mb-1 block";

const StatusPage = () => {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSnap, setShowSnap] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    Promise.all([getPlans(), getSnapshots(), getObligations()])
      .then(([p, s, o]) => {
        setPlans(p);
        setSnapshots(s);
        setObligations(o);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const plan = useMemo(() => plans.find((p) => p.active) ?? plans[0] ?? null, [plans]);
  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  const obligById = useMemo(
    () => new Map(obligations.map((o) => [o.obligation_id, o])),
    [obligations],
  );

  // Join stages to their live obligation numbers for the pure metrics.
  const stageInputs: PlanStageInput[] = useMemo(
    () =>
      (plan?.stages ?? []).map((s) => ({
        stage_id: s.stage_id,
        position: s.position,
        label: s.label,
        kind: s.kind,
        target_lo: s.target_lo,
        target_hi: s.target_hi,
        obligation: s.obligation_id
          ? {
              current_balance: num(obligById.get(s.obligation_id)?.current_balance ?? null),
              original_balance: num(obligById.get(s.obligation_id)?.original_balance ?? null),
            }
          : null,
      })),
    [plan, obligById],
  );

  const snapInput: SnapshotInput | null = latest
    ? { ops: latest.ops, vault: latest.vault, maintenance: latest.maintenance, tax: latest.tax, trailer: latest.trailer }
    : null;

  const status = useMemo(
    () =>
      plan ? getPlanStatus(snapInput, { float_line: plan.float_line, stages: stageInputs }) : null,
    [plan, snapInput, stageInputs],
  );

  const trend = useMemo(
    () =>
      snapshots.map((s) => ({
        week: formatDate(s.as_of) ?? s.as_of,
        ops: Number(s.ops),
        vault: Number(s.vault),
      })),
    [snapshots],
  );

  // ---- snapshot form ----
  const [fAsOf, setFAsOf] = useState(todayKey());
  const [fOps, setFOps] = useState("");
  const [fVault, setFVault] = useState("");
  const [fMaint, setFMaint] = useState("");
  const [fTax, setFTax] = useState("");
  const [fTrailer, setFTrailer] = useState("");
  const [fNote, setFNote] = useState("");

  const draftStatus = useMemo(() => {
    if (!plan) return null;
    const draft: SnapshotInput = { ops: fOps || null, vault: fVault || null, maintenance: fMaint || null, tax: fTax || null, trailer: fTrailer || "0" };
    return getPlanStatus(draft, { float_line: plan.float_line, stages: stageInputs });
  }, [plan, stageInputs, fOps, fVault, fMaint, fTax, fTrailer]);

  const saveSnapshot = async () => {
    setBusy(true);
    setError(null);
    try {
      await createSnapshot({
        as_of: fAsOf,
        ops: Number(fOps),
        vault: Number(fVault),
        maintenance: Number(fMaint),
        tax: Number(fTax),
        trailer: fTrailer ? Number(fTrailer) : 0,
        note: fNote.trim() || null,
      });
      setShowSnap(false);
      setFOps(""); setFVault(""); setFMaint(""); setFTax(""); setFTrailer(""); setFNote("");
      await load();
    } catch (e) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          "Could not save the snapshot",
      );
    } finally {
      setBusy(false);
    }
  };

  // ---- plan editor (local draft of plan fields + stages) ----
  const [pLabel, setPLabel] = useState("");
  const [pYear, setPYear] = useState("");
  const [pFloat, setPFloat] = useState("");
  const [pHomeLo, setPHomeLo] = useState("");
  const [pHomeHi, setPHomeHi] = useState("");
  const [pMaint, setPMaint] = useState("");
  const [pTax, setPTax] = useState("");
  const [pStages, setPStages] = useState<PlanStageRow[]>([]);

  const openPlanEditor = () => {
    if (!plan) return;
    setPLabel(plan.label);
    setPYear(String(plan.year));
    setPFloat(String(plan.float_line));
    setPHomeLo(plan.float_line_home_lo ?? "");
    setPHomeHi(plan.float_line_home_hi ?? "");
    setPMaint(String(plan.maintenance_weekly));
    setPTax(String(plan.tax_weekly));
    setPStages([...plan.stages].sort((a, b) => a.position - b.position));
    setError(null);
    setShowPlan(true);
  };

  const moveStage = (i: number, dir: -1 | 1) => {
    setPStages((rows) => {
      const j = i + dir;
      if (j < 0 || j >= rows.length) return rows;
      const next = [...rows];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const editStage = (i: number, patch: Partial<PlanStageRow>) =>
    setPStages((rows) => rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const savePlan = async () => {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      await patchPlan(plan.plan_id, {
        label: pLabel.trim(),
        year: Number(pYear),
        float_line: Number(pFloat),
        float_line_home_lo: pHomeLo ? Number(pHomeLo) : null,
        float_line_home_hi: pHomeHi ? Number(pHomeHi) : null,
        maintenance_weekly: Number(pMaint),
        tax_weekly: Number(pTax),
      });
      // Persist the draft stages: new rows create, existing rows patch with
      // their (possibly reordered) position.
      const keepIds = new Set<string>();
      for (let i = 0; i < pStages.length; i++) {
        const s = pStages[i];
        const body = {
          position: i + 1,
          label: s.label,
          kind: s.kind,
          obligation_id: s.obligation_id,
          target_lo: s.target_lo === "" ? null : s.target_lo,
          target_hi: s.target_hi === "" ? null : s.target_hi,
        };
        if (s.stage_id.startsWith("new-")) {
          await createStage(plan.plan_id, body);
        } else {
          keepIds.add(s.stage_id);
          await patchStage(s.stage_id, body);
        }
      }
      for (const s of plan.stages) {
        if (!keepIds.has(s.stage_id) && !pStages.some((x) => x.stage_id === s.stage_id)) {
          await deleteStage(s.stage_id);
        }
      }
      setShowPlan(false);
      await load();
    } catch (e) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          "Could not save the plan",
      );
    } finally {
      setBusy(false);
    }
  };

  const writeNextYearPlan = async () => {
    if (!plan) return;
    if (
      !window.confirm(
        `Write The ${plan.year + 1} Plan? It starts from this plan's stages and becomes active; ${plan.year}'s snapshots and history stay put.`,
      )
    )
      return;
    setBusy(true);
    try {
      const next = await createPlan({
        label: `The ${plan.year + 1} Plan`,
        year: plan.year + 1,
        float_line: Number(plan.float_line),
        float_line_home_lo: plan.float_line_home_lo ? Number(plan.float_line_home_lo) : null,
        float_line_home_hi: plan.float_line_home_hi ? Number(plan.float_line_home_hi) : null,
        maintenance_weekly: Number(plan.maintenance_weekly),
        tax_weekly: Number(plan.tax_weekly),
        active: true,
      });
      for (const s of [...plan.stages].sort((a, b) => a.position - b.position)) {
        await createStage(next.plan_id, {
          position: s.position,
          label: s.label,
          kind: s.kind,
          obligation_id: s.obligation_id,
          target_lo: s.target_lo,
          target_hi: s.target_hi,
        });
      }
      setShowPlan(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loading)
    return (
      <div className="p-6 text-ink font-body min-h-screen">
        <Skeleton className="h-8 w-56 mb-6" />
        <Skeleton className="h-40 mb-4" />
        <Skeleton className="h-64" />
      </div>
    );

  const act =
    status?.waterfall?.activeIndex != null
      ? status.waterfall.stages[status.waterfall.activeIndex]
      : null;

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">ACCOUNT STATUS</h1>
          <span className="font-condensed font-medium text-[15px] text-dim">
            where the money stands
          </span>
          {plan && (
            <span className="font-display text-[14px] tracking-[.12em] text-amber-hi rounded-[4px] px-[9px] pt-[3px] pb-[2px] rotate-[-1.2deg]"
              style={{ border: "1.5px solid rgba(245,176,58,.55)" }}>
              {plan.label.toUpperCase()}
            </span>
          )}
          <button
            onClick={openPlanEditor}
            className="font-condensed font-semibold text-[12px] tracking-[.06em] text-dim hover:text-ink"
          >
            EDIT PLAN ▸
          </button>
          <span className="flex-1" />
          <button
            onClick={() => {
              setFAsOf(todayKey());
              setError(null);
              setShowSnap(true);
            }}
            className="h-9 px-4 rounded-[10px] font-condensed font-semibold text-[14px] tracking-[.05em] text-canvas"
            style={{
              background: "linear-gradient(178deg, var(--color-hot), var(--color-amber))",
              boxShadow: "0 5px 14px rgba(232,148,10,.3), inset 0 1px 0 rgba(255,255,255,.5)",
            }}
          >
            + FRIDAY SNAPSHOT
          </button>
        </div>

        {/* the plan sentence */}
        <div className="flex items-center gap-3 flex-wrap mt-4 font-condensed">
          {status?.verdict ? (
            <span
              className="font-forge font-bold text-[14px] tracking-[.14em] rounded-[8px] px-3 py-[2px] rotate-[-2deg] border-2"
              style={
                status.verdict === "on-plan"
                  ? { color: "#6fd08c", borderColor: "#6fd08c", boxShadow: "inset 0 0 12px rgba(111,208,140,.12)" }
                  : { color: "#f5b03a", borderColor: "#f5b03a", boxShadow: "inset 0 0 12px rgba(232,148,10,.12)" }
              }
            >
              {status.verdict === "on-plan" ? "ON PLAN" : "BELOW FLOAT — HOLD"}
            </span>
          ) : (
            <span className="font-forge font-bold text-[14px] tracking-[.14em] rounded-[8px] px-3 py-[2px] border-2 border-dashed border-hairline text-faint">
              NO SNAPSHOT YET
            </span>
          )}
          <span className="text-[13.5px] text-faint">
            {act && (
              <>
                · stage {act.stage.position} — <b className="font-semibold text-ink">{act.stage.label}</b>
              </>
            )}
            {status?.orders?.length ? (
              <>
                {" "}
                · this Friday: <b className="font-semibold text-ink">{status.orders.join(" · ")}</b>
              </>
            ) : null}
            {latest && <> · snapshot {formatDate(latest.as_of)}</>}
            {" "}· <b className="font-semibold text-ink">{snapshots.length}</b> week
            {snapshots.length === 1 ? "" : "s"} tracked
          </span>
        </div>

        {/* ops + cushion */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div
            className="rounded-[14px] border overflow-hidden"
            style={{ background: "linear-gradient(180deg, #0e1420, #0b101a)", borderColor: "var(--color-hairline)", boxShadow: "0 14px 34px rgba(0,0,0,.45)" }}
          >
            <div className="px-4 py-3 border-b ds2-cell-rule" style={{ background: "linear-gradient(90deg, rgba(232,148,10,.08), transparent 55%)" }}>
              <span className="font-forge font-bold text-[17px]" style={{ letterSpacing: "1.5px" }}>OPS — THE FLOAT</span>
            </div>
            <div className="p-4">
              <p className="font-display text-[40px] leading-none tabular-nums">
                {latest ? money(Number(latest.ops)) : "—"}
              </p>
              <p className="font-condensed text-[11px] tracking-[.14em] uppercase text-faint mt-1">
                ops balance · float line {plan ? money(Number(plan.float_line)) : "—"}
              </p>
              {status?.sweep != null && status.sweep > 0 ? (
                <p className="inline-block mt-3 rounded-[10px] px-[14px] py-[10px] font-condensed font-bold text-[15px] tracking-[.04em] text-canvas"
                  style={{ background: "linear-gradient(178deg, var(--color-hot), var(--color-amber))", boxShadow: "0 4px 12px rgba(232,148,10,.3)" }}>
                  SWEEP {money(status.sweep)} TO THE VAULT →
                </p>
              ) : status?.sweep === 0 ? (
                <p className="inline-block mt-3 rounded-[10px] px-[14px] py-[10px] font-condensed font-bold text-[15px] tracking-[.04em] text-amber-hi border border-amber/40">
                  BELOW FLOAT — HOLD
                </p>
              ) : (
                <p className="font-condensed text-[13px] text-faint border border-dashed border-hairline rounded-[8px] px-3 py-[10px] mt-3 inline-block">
                  Take the first Friday snapshot and the orders appear here.
                </p>
              )}
              <p className="font-condensed text-[11.5px] text-faint mt-3">
                snapshot first, then move the money — next week's snapshot confirms the sweep landed.
                {plan?.float_line_home_lo && (
                  <> home-time weeks run {money(Number(plan.float_line_home_lo))}–{money(Number(plan.float_line_home_hi ?? plan.float_line_home_lo))}.</>
                )}
              </p>
            </div>
          </div>

          <div
            className="rounded-[14px] border overflow-hidden"
            style={{ background: "linear-gradient(180deg, #0e1420, #0b101a)", borderColor: "var(--color-hairline)", boxShadow: "0 14px 34px rgba(0,0,0,.45)" }}
          >
            <div className="px-4 py-3 border-b ds2-cell-rule" style={{ background: "linear-gradient(90deg, rgba(232,148,10,.08), transparent 55%)" }}>
              <span className="font-forge font-bold text-[17px]" style={{ letterSpacing: "1.5px" }}>THE VAULT — CUSHION</span>
            </div>
            <div className="p-4">
              <p className="font-display text-[40px] leading-none tabular-nums">
                {latest ? money(Number(latest.vault)) : "—"}
              </p>
              <p className="font-condensed text-[11px] tracking-[.14em] uppercase text-faint mt-1">
                {status?.cushion
                  ? status.cushion.toFloor > 0
                    ? `vault balance · ${money(status.cushion.toFloor)} to the floor`
                    : `floor holds · ${money(status.cushion.toGoal)} to the goal`
                  : "vault balance"}
              </p>
              {status?.cushion && (
                <div className="mt-4">
                  <Cells pct={status.cushion.pctGoal} cells={24} />
                </div>
              )}
              <p className="font-condensed text-[11.5px] text-faint mt-3 flex gap-4 flex-wrap">
                <span><b className="text-ink">▌</b> floor — never touch the road broke</span>
                <span style={{ opacity: 0.7 }}><b className="text-dim">▌</b> goal — three months' runway</span>
              </p>
            </div>
          </div>
        </div>

        {/* the waterfall */}
        {status?.waterfall && (
          <div className="ds2-board overflow-hidden mt-4">
            <div className="flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule">
              <span className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
                The waterfall — every spare dollar has one job
              </span>
              <span className="font-condensed text-[12px] text-faint">
                · ratchet at {money(status.waterfall.protectedLevel)} · stages are the plan — edit them
              </span>
            </div>
            {status.waterfall.stages.map((st) => (
              <div
                key={st.stage.stage_id ?? st.stage.position}
                className={`flex items-center gap-[14px] px-4 py-3 border-t ds2-cell-rule first:border-t-0 ${st.state === "pending" ? "opacity-55" : ""}`}
              >
                <span
                  className="w-[30px] h-[30px] rounded-full flex items-center justify-center font-display text-[15px] shrink-0"
                  style={
                    st.state === "done"
                      ? { background: "linear-gradient(180deg, var(--color-hot), var(--color-amber))", color: "var(--color-canvas)" }
                      : st.state === "active"
                        ? { border: "2px solid var(--color-amber-hi)", color: "var(--color-amber-hi)" }
                        : { border: "2px dashed var(--color-hairline)", color: "var(--color-faint)" }
                  }
                >
                  {st.stage.position}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-condensed font-semibold text-[15px]">
                    {st.stage.label}
                    {st.state === "done" && (
                      <span className="font-forge text-[10.5px] tracking-[.12em] text-[#6fd08c] border-[1.5px] border-[#6fd08c] rounded-[4px] px-[6px] py-[1px] ml-2 inline-block rotate-[-2deg]">
                        DONE
                      </span>
                    )}
                  </p>
                  {st.stage.kind === "obligation" && st.currentValue == null && (
                    <p className="font-condensed text-[12px] text-faint mt-[2px]">
                      not bound to an obligation yet — bind it in EDIT PLAN to grade this stage
                    </p>
                  )}
                  {st.state === "active" && st.overflow != null && (
                    <p className="font-condensed text-[12px] text-amber-hi mt-[2px]">
                      {st.overflow > 0
                        ? `${money(st.overflow)} above the ratchet — send it here`
                        : "nothing above the ratchet yet — the sweep builds it"}
                    </p>
                  )}
                  <div className="max-w-[340px] mt-[6px]">
                    <Cells pct={st.progress} dim={st.state === "pending"} />
                  </div>
                </div>
                <div className="text-right shrink-0 font-condensed">
                  <p className="font-semibold text-[14px] tabular-nums">
                    {st.currentValue != null ? money(st.currentValue) : "—"}
                  </p>
                  <p className="text-[10.5px] text-faint">
                    {st.stage.kind === "obligation"
                      ? "balance left"
                      : st.stage.kind === "trailer"
                        ? `above the ratchet · of ${money(Number(st.stage.target_lo ?? 0))}${st.stage.target_hi ? `–${money(Number(st.stage.target_hi))}` : ""}`
                        : st.stage.target_lo != null
                          ? `of ${money(Number(st.stage.target_lo))}${st.stage.target_hi ? `–${money(Number(st.stage.target_hi))}` : ""}`
                          : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* reserves + trend */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div className="ds2-board overflow-hidden">
            <div className="flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule">
              <span className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">Reserves</span>
              <span className="font-condensed text-[12px] text-faint">
                {plan && `· ${money(Number(plan.maintenance_weekly))}/wk maintenance · ${money(Number(plan.tax_weekly))}/wk tax`}
              </span>
            </div>
            <div className="grid grid-cols-3">
              <div className="px-4 py-4 border-r ds2-cell-rule">
                <p className="font-condensed font-semibold text-[23px] tabular-nums">
                  {latest ? money(Number(latest.maintenance)) : "—"}
                </p>
                <p className="font-condensed text-[10.5px] tracking-[.12em] uppercase text-faint mt-[2px]">
                  Maintenance · repairs only
                </p>
              </div>
              <div className="px-4 py-4 border-r ds2-cell-rule">
                <p className="font-condensed font-semibold text-[23px] tabular-nums">
                  {latest ? money(Number(latest.tax)) : "—"}
                </p>
                <p className="font-condensed text-[10.5px] tracking-[.12em] uppercase text-faint mt-[2px]">Tax</p>
              </div>
              <div className="px-4 py-4">
                <p className="font-condensed font-semibold text-[23px] tabular-nums">
                  {latest ? money(Number(latest.trailer)) : "—"}
                </p>
                <p className="font-condensed text-[10.5px] tracking-[.12em] uppercase text-faint mt-[2px]">
                  Trailer holding · zeroes monthly
                </p>
              </div>
            </div>
          </div>

          <div className="ds2-board overflow-hidden">
            <div className="flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule">
              <span className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">The trend</span>
              <span className="font-condensed text-[12px] text-faint">· ops + vault, week by week</span>
            </div>
            <div className="px-2 pt-3 pb-1" style={{ height: 190 }}>
              {trend.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid stroke="#141c2a" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="week" stroke="#5a6880" fontSize={10.5} tickLine={false} axisLine={{ stroke: "#1c2637" }} />
                    <YAxis stroke="#5a6880" fontSize={10.5} tickLine={false} axisLine={false} tickFormatter={(v) => `$${Number(v) >= 1000 ? `${Math.round(Number(v) / 1000)}k` : v}`} />
                    <Tooltip
                      contentStyle={{ background: "var(--color-panel)", border: "1px solid var(--color-hairline)", borderRadius: 8, fontSize: 12 }}
                      formatter={(v, name) => [money(Number(v)), name === "ops" ? "ops" : "vault"]}
                    />
                    <Line type="monotone" dataKey="ops" stroke="#f5b03a" strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="vault" stroke="#4f8cd6" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="font-condensed text-[13px] text-faint px-3 py-6">
                  The trend draws after two snapshots — one Friday at a time.
                </p>
              )}
            </div>
            <div className="flex gap-4 font-condensed text-[11px] text-faint px-4 pb-2">
              <span><i className="inline-block w-3.5 h-[3px] rounded align-middle mr-1" style={{ background: "#f5b03a" }} />ops</span>
              <span><i className="inline-block w-3.5 h-[3px] rounded align-middle mr-1" style={{ background: "#4f8cd6" }} />vault</span>
            </div>
          </div>
        </div>

        {/* snapshot popup */}
        {showSnap && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowSnap(false)} />
            <div className="relative w-full max-w-[540px] mx-4 max-h-[90vh] overflow-y-auto bg-canvas text-ink rounded-[12px] border border-hairline shadow-xl">
              <div className="flex items-center gap-3 px-5 py-[14px] border-b ds2-cell-rule"
                style={{ background: "linear-gradient(90deg, rgba(232,148,10,.08), transparent 55%)" }}>
                <span className="font-forge font-bold text-[19px]" style={{ letterSpacing: "1.5px" }}>FRIDAY SNAPSHOT</span>
                <span className="font-condensed text-[11px] text-faint tracking-[.06em] uppercase">raw balances — before you move anything</span>
                <button className="ml-auto text-faint hover:text-ink" aria-label="Close" onClick={() => setShowSnap(false)}>✕</button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-3">
                <div><label className={LBL}>As of</label><input type="date" className={FIELD} value={fAsOf} onChange={(e) => setFAsOf(e.target.value)} /></div>
                <div><label className={LBL}>Ops</label><input inputMode="decimal" placeholder="12300" className={FIELD} value={fOps} onChange={(e) => setFOps(e.target.value)} /></div>
                <div><label className={LBL}>Vault</label><input inputMode="decimal" placeholder="8750" className={FIELD} value={fVault} onChange={(e) => setFVault(e.target.value)} /></div>
                <div><label className={LBL}>Maintenance</label><input inputMode="decimal" placeholder="1500" className={FIELD} value={fMaint} onChange={(e) => setFMaint(e.target.value)} /></div>
                <div><label className={LBL}>Tax</label><input inputMode="decimal" placeholder="2100" className={FIELD} value={fTax} onChange={(e) => setFTax(e.target.value)} /></div>
                <div><label className={LBL}>Trailer holding</label><input inputMode="decimal" placeholder="0" className={FIELD} value={fTrailer} onChange={(e) => setFTrailer(e.target.value)} /></div>
                {draftStatus?.orders?.length ? (
                  <p className="col-span-2 font-condensed text-[12.5px] text-faint border border-dashed border-hairline rounded-[8px] px-3 py-2">
                    the verdict as you type: <b className="text-amber-hi">{draftStatus.orders.join(" · ")}</b>
                  </p>
                ) : null}
                <div className="col-span-2"><label className={LBL}>Note · optional</label><input className={FIELD} value={fNote} onChange={(e) => setFNote(e.target.value)} placeholder="settlement + payroll landed" /></div>
                {error && <p className="col-span-2 text-destructive text-sm">{error}</p>}
              </div>
              <div className="flex gap-2 justify-end px-5 pb-5">
                <button className="h-9 px-4 rounded-[9px] font-condensed font-semibold text-[13.5px] text-dim bg-well border border-hairline" onClick={() => setShowSnap(false)}>CANCEL</button>
                <button
                  className="h-9 px-4 rounded-[9px] font-condensed font-semibold text-[13.5px] text-canvas disabled:opacity-50"
                  style={{ background: "linear-gradient(178deg, var(--color-hot), var(--color-amber))" }}
                  disabled={busy || !fOps || !fVault || !fMaint || !fTax}
                  onClick={saveSnapshot}
                >
                  {busy ? "SAVING…" : "SAVE SNAPSHOT"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* plan editor popup */}
        {showPlan && plan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowPlan(false)} />
            <div className="relative w-full max-w-[640px] mx-4 max-h-[90vh] overflow-y-auto bg-canvas text-ink rounded-[12px] border border-hairline shadow-xl">
              <div className="flex items-center gap-3 px-5 py-[14px] border-b ds2-cell-rule"
                style={{ background: "linear-gradient(90deg, rgba(232,148,10,.08), transparent 55%)" }}>
                <span className="font-forge font-bold text-[19px]" style={{ letterSpacing: "1.5px" }}>{plan.label.toUpperCase()}</span>
                {plan.active && <span className="font-condensed text-[11px] text-faint tracking-[.08em]">· ACTIVE</span>}
                <button className="ml-auto text-faint hover:text-ink" aria-label="Close" onClick={() => setShowPlan(false)}>✕</button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-3">
                <div><label className={LBL}>Plan label</label><input className={FIELD} value={pLabel} onChange={(e) => setPLabel(e.target.value)} /></div>
                <div><label className={LBL}>Year</label><input inputMode="numeric" className={FIELD} value={pYear} onChange={(e) => setPYear(e.target.value)} /></div>
                <div><label className={LBL}>Ops float line</label><input inputMode="decimal" className={FIELD} value={pFloat} onChange={(e) => setPFloat(e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={LBL}>Home wk lo</label><input inputMode="decimal" className={FIELD} value={pHomeLo} onChange={(e) => setPHomeLo(e.target.value)} /></div>
                  <div><label className={LBL}>Home wk hi</label><input inputMode="decimal" className={FIELD} value={pHomeHi} onChange={(e) => setPHomeHi(e.target.value)} /></div>
                </div>
                <div><label className={LBL}>Maintenance / wk</label><input inputMode="decimal" className={FIELD} value={pMaint} onChange={(e) => setPMaint(e.target.value)} /></div>
                <div><label className={LBL}>Tax / wk</label><input inputMode="decimal" className={FIELD} value={pTax} onChange={(e) => setPTax(e.target.value)} /></div>

                <p className="col-span-2 font-condensed font-semibold text-[11px] tracking-[.14em] uppercase text-faint mt-2">
                  The waterfall — order is the plan · debt stages bind to an obligation
                </p>
                {pStages.map((s, i) => (
                  <div key={s.stage_id} className="col-span-2 rounded-[10px] border border-hairline-lo bg-well/50 p-3 grid grid-cols-[auto_1fr] gap-2">
                    <div className="flex flex-col gap-1">
                      <button className="text-faint hover:text-ink text-[12px]" aria-label="Move up" onClick={() => moveStage(i, -1)}>▲</button>
                      <span className="font-display text-[14px] text-center text-dim">{i + 1}</span>
                      <button className="text-faint hover:text-ink text-[12px]" aria-label="Move down" onClick={() => moveStage(i, 1)}>▼</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 min-w-0">
                      <div className="col-span-2 flex gap-2">
                        <input className={FIELD} value={s.label} onChange={(e) => editStage(i, { label: e.target.value })} />
                        <button
                          className="shrink-0 text-faint hover:text-[#e05252] px-1"
                          aria-label="Remove stage"
                          onClick={() => setPStages((rows) => rows.filter((_, k) => k !== i))}
                        >
                          ✕
                        </button>
                      </div>
                      <select className={FIELD} value={s.kind} onChange={(e) => editStage(i, { kind: e.target.value as PlanStageRow["kind"], obligation_id: e.target.value === "obligation" ? s.obligation_id : null })}>
                        <option value="vault">vault threshold</option>
                        <option value="obligation">pay off an obligation</option>
                        <option value="trailer">trade-up fund · vault overflow above the ratchet</option>
                      </select>
                      {s.kind === "obligation" ? (
                        <select className={FIELD} value={s.obligation_id ?? ""} onChange={(e) => editStage(i, { obligation_id: e.target.value || null })}>
                          <option value="">bind an obligation…</option>
                          {obligations.map((o) => (
                            <option key={o.obligation_id} value={o.obligation_id}>{o.label}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="flex gap-2">
                          <input inputMode="decimal" placeholder="target" className={FIELD} value={s.target_lo ?? ""} onChange={(e) => editStage(i, { target_lo: e.target.value })} />
                          <input inputMode="decimal" placeholder="hi (opt)" className={FIELD} value={s.target_hi ?? ""} onChange={(e) => editStage(i, { target_hi: e.target.value })} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div className="col-span-2 flex gap-3 flex-wrap items-center">
                  <button
                    className="font-condensed font-semibold text-[12.5px] tracking-[.06em] text-amber-hi hover:text-hot"
                    onClick={() =>
                      setPStages((rows) => [
                        ...rows,
                        { stage_id: `new-${Date.now()}`, plan_id: plan.plan_id, position: rows.length + 1, label: "New stage", kind: "vault", obligation_id: null, target_lo: "", target_hi: "" },
                      ])
                    }
                  >
                    + ADD STAGE
                  </button>
                  <button
                    className="ml-auto font-condensed font-semibold text-[12.5px] tracking-[.06em] text-dim hover:text-ink"
                    disabled={busy}
                    onClick={writeNextYearPlan}
                  >
                    WRITE THE {plan.year + 1} PLAN →
                  </button>
                </div>
                {error && <p className="col-span-2 text-destructive text-sm">{error}</p>}
              </div>
              <div className="flex gap-2 justify-end px-5 pb-5">
                <button className="h-9 px-4 rounded-[9px] font-condensed font-semibold text-[13.5px] text-dim bg-well border border-hairline" onClick={() => setShowPlan(false)}>CANCEL</button>
                <button
                  className="h-9 px-4 rounded-[9px] font-condensed font-semibold text-[13.5px] text-canvas disabled:opacity-50"
                  style={{ background: "linear-gradient(178deg, var(--color-hot), var(--color-amber))" }}
                  disabled={busy}
                  onClick={savePlan}
                >
                  {busy ? "SAVING…" : "SAVE PLAN"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StatusPage;
