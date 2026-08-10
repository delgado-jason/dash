import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { Facility } from "@/types/facility";
import {
  getFacility,
  mergeFacilities,
  patchFacility,
} from "@/services/facilitiesService";
import { useFacilities } from "@/hooks/useFacilities";
import { useLoads } from "@/hooks/useLoads";
import { fmtTime, fmtDuration, dwellMinutes } from "@/lib/stopTimes";
import { onTimeStatus, type OnTime } from "@/lib/detention";
import { facilityStops, scoreStops, MIN_STOPS } from "@/lib/metrics/stopScore";
import { KindChip } from "@/components/facilities/KindChip";
import { facilityLabel } from "@/lib/facilityMatch";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockSkeleton } from "@/components/ui/PageSkeletons";
import { formatDate } from "@/lib/format";

const PlateLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
    {children}
  </p>
);

const GhostLine = ({ children }: { children: React.ReactNode }) => (
  <p className="font-condensed text-[13px] text-faint border border-dashed border-hairline rounded-[8px] px-3 py-[10px] mt-[10px]">
    {children}
  </p>
);

// One stop this facility played on a load, with everything the history row shows.
interface StopRow {
  loadId: string;
  loadNumber: string;
  role: "shipper" | "receiver";
  date?: string | null;
  inT?: string | null;
  outT?: string | null;
  onTime: OnTime | null;
  appt?: string | null;
}

const APPT_CLAUSE: Record<OnTime, (t: string) => { text: string; tone: string }> = {
  waited: (t) => ({ text: `· beat the ${t} appt`, tone: "text-[#6fd08c]" }),
  "on-time": (t) => ({ text: `· made the ${t} appt`, tone: "text-[#6fd08c]" }),
  late: (t) => ({ text: `· missed the ${t} appt`, tone: "text-[#e05252]" }),
};

const FacilityDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [facility, setFacility] = useState<Facility | null>(null);
  const [freeHours, setFreeHours] = useState(3);
  const { loads } = useLoads(0);
  const { facilities } = useFacilities(0);
  const [mergeTarget, setMergeTarget] = useState("");
  const [merging, setMerging] = useState(false);
  const [notes, setNotes] = useState("");
  const [notesSeeded, setNotesSeeded] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    if (!id) return;
    getFacility(id)
      .then((f) => {
        setFacility(f);
        setNotes(f.notes ?? "");
        setNotesSeeded(true);
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    getSettlementSchedule()
      .then((s) => setFreeHours(s.detention_free_hours))
      .catch(() => {});
  }, []);

  // Merge THIS facility into another (the fallback for dupes the finder can't
  // auto-cluster). Reassigns its stops onto the target, then deletes this one.
  const doMerge = async () => {
    if (!id || !mergeTarget) return;
    const target = facilities.find((f) => f.facility_id === mergeTarget);
    if (
      !window.confirm(
        `Merge ${facility ? facilityLabel(facility) : "this facility"} into ${
          target ? facilityLabel(target) : "the selected facility"
        }? Its stops move over, then this card is deleted. This can't be undone.`,
      )
    )
      return;
    setMerging(true);
    try {
      await mergeFacilities(mergeTarget, [id]);
      navigate(`/facilities/${mergeTarget}`);
    } catch {
      setMerging(false);
    }
  };

  const saveNotes = async () => {
    if (!id) return;
    setSavingNotes(true);
    try {
      const updated = await patchFacility(id, { notes: notes.trim() || null });
      setFacility(updated);
      setNotes(updated.notes ?? "");
    } catch {
      // leave the draft in place; the button stays armed to retry
    } finally {
      setSavingNotes(false);
    }
  };

  const score = useMemo(
    () => (id ? scoreStops(facilityStops(loads ?? [], id, freeHours)) : null),
    [loads, id, freeHours],
  );

  const rows = useMemo<StopRow[]>(() => {
    const out: StopRow[] = [];
    for (const l of loads ?? []) {
      if (l.shipper_facility_id === id)
        out.push({
          loadId: l.load_id,
          loadNumber: l.load_number,
          role: "shipper",
          date: l.pickup_date,
          inT: l.shipper_in,
          outT: l.shipper_out,
          onTime: onTimeStatus(l.pickup_appt_start, l.pickup_appt_end, l.shipper_in),
          appt: l.pickup_appt_start,
        });
      if (l.receiver_facility_id === id)
        out.push({
          loadId: l.load_id,
          loadNumber: l.load_number,
          role: "receiver",
          date: l.delivery_date,
          inT: l.receiver_in,
          outT: l.receiver_out,
          onTime: onTimeStatus(l.delivery_appt_start, l.delivery_appt_end, l.receiver_in),
          appt: l.delivery_appt_start,
        });
    }
    return out.sort((a, b) => ((a.date ?? "") < (b.date ?? "") ? 1 : -1));
  }, [loads, id]);

  const role =
    rows.some((r) => r.role === "shipper") && rows.some((r) => r.role === "receiver")
      ? "ships · receives"
      : rows.some((r) => r.role === "shipper")
        ? "ships"
        : rows.some((r) => r.role === "receiver")
          ? "receives"
          : "—";

  if (!facility)
    return (
      <div className="p-6 text-ink font-body min-h-screen">
        <Skeleton className="h-8 w-56 mb-2" />
        <Skeleton className="h-4 w-32 mb-6" />
        <BlockSkeleton className="h-40" />
      </div>
    );

  const notesDirty = notesSeeded && (facility.notes ?? "") !== notes.trim();
  const onTimeCount =
    score && score.onTimePct != null ? Math.round(score.onTimePct * score.gradedStops) : 0;

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">FACILITIES</h1>
          <Link
            to="/facilities"
            className="font-condensed font-medium text-[15px] text-faint hover:text-ink"
          >
            ← back to the ledger
          </Link>
        </div>

        <div className="flex items-baseline gap-[14px] flex-wrap mt-[18px]">
          <h2 className="font-display text-[34px] tracking-[.04em] leading-none">
            {facilityLabel(facility).toUpperCase()}
          </h2>
          <span className="font-condensed font-semibold text-[13px] tracking-[.12em] text-faint uppercase">
            {facility.city}, {facility.state} · {role}
          </span>
          <KindChip kind={facility.kind} />
          <span className="ml-auto text-right">
            <span className="font-display text-[19px] tracking-[.04em] tabular-nums block leading-none">
              {rows.length}
            </span>
            <span className="font-condensed text-[10.5px] text-faint tracking-[.08em]">
              VISIT{rows.length === 1 ? "" : "S"}
            </span>
          </span>
        </div>

        {/* dock scorecard */}
        <div className="ds2-board p-4 mt-4">
          <PlateLabel>Dock scorecard</PlateLabel>
          {score && score.timedStops > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 mt-[10px] border border-hairline-lo rounded-[10px] overflow-hidden">
                <div className="px-4 py-3 bg-well sm:border-r border-b sm:border-b-0 ds2-cell-rule">
                  <p className="font-condensed font-semibold text-[11px] tracking-[.14em] uppercase text-faint">
                    Median dwell
                  </p>
                  <p className="font-condensed font-semibold text-[24px] mt-1 tabular-nums">
                    {fmtDuration(score.medianDwellMin) ?? "—"}{" "}
                    <span className="text-[12.5px] text-faint font-medium">
                      {score.timedStops} timed stop{score.timedStops === 1 ? "" : "s"}
                    </span>
                  </p>
                </div>
                <div className="px-4 py-3 bg-well sm:border-r border-b sm:border-b-0 ds2-cell-rule">
                  <p className="font-condensed font-semibold text-[11px] tracking-[.14em] uppercase text-faint">
                    On-time arrivals
                  </p>
                  <p className="font-condensed font-semibold text-[24px] mt-1 tabular-nums">
                    {score.gradedStops > 0 ? (
                      <>
                        {onTimeCount} of {score.gradedStops}{" "}
                        <span className="text-[12.5px] text-faint font-medium">you, not them</span>
                      </>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </p>
                </div>
                <div className="px-4 py-3 bg-well">
                  <p className="font-condensed font-semibold text-[11px] tracking-[.14em] uppercase text-faint">
                    Ran past free time
                  </p>
                  <p className="font-condensed font-semibold text-[24px] mt-1 tabular-nums">
                    {score.detentionCount}{" "}
                    <span className="text-[12.5px] text-faint font-medium">
                      of {score.timedStops} stop{score.timedStops === 1 ? "" : "s"}
                    </span>
                    {score.unpaidCount > 0 && (
                      <span className="text-[12.5px] text-[#e05252] font-medium">
                        {" "}
                        · {score.unpaidCount} unpaid
                      </span>
                    )}
                  </p>
                </div>
              </div>
              {!score.hasData && (
                <div className="mt-[10px]">
                  <span className="font-condensed text-[13px] text-faint">
                    Full scorecard forges at {MIN_STOPS} timed stops —{" "}
                    {MIN_STOPS - score.timedStops} more visit
                    {MIN_STOPS - score.timedStops === 1 ? "" : "s"} with in/out logged and
                    this dock gets graded.
                  </span>
                  <div className="flex gap-[5px] mt-[7px]">
                    {Array.from({ length: MIN_STOPS }, (_, i) => (
                      <i
                        key={i}
                        className="w-[34px] h-[10px] rounded-[3px]"
                        style={
                          i < score.timedStops
                            ? {
                                background:
                                  "linear-gradient(180deg, var(--color-hot), var(--color-amber))",
                                boxShadow: "0 0 8px rgba(232,148,10,.3)",
                              }
                            : { border: "1px dashed var(--color-hairline)" }
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <GhostLine>
              No timed stops yet. Log in and out times on a load here and the clock
              starts — the scorecard forges at {MIN_STOPS} timed stops.
            </GhostLine>
          )}
        </div>

        {/* stop history */}
        <div className="ds2-board p-4 mt-[14px]">
          <PlateLabel>Stop history — every time you've been here</PlateLabel>
          {rows.length === 0 ? (
            <GhostLine>No stops on record.</GhostLine>
          ) : (
            <div className="mt-[6px] overflow-x-auto">
              <div className="min-w-[560px]">
                {rows.map((r) => {
                  const dwellStr = fmtDuration(dwellMinutes(r.inT, r.outT));
                  const clause =
                    r.onTime && r.appt ? APPT_CLAUSE[r.onTime](fmtTime(r.appt)) : null;
                  return (
                    <div
                      key={`${r.loadId}-${r.role}`}
                      className="grid grid-cols-[100px_105px_90px_1fr_90px] gap-[10px] items-baseline py-[9px] border-t ds2-cell-rule first:border-t-0 font-condensed text-[13.5px] text-dim"
                    >
                      <Link
                        to={`/loads/${r.loadId}`}
                        className="font-display text-[15px] tracking-[.05em] text-amber-hi hover:text-hot"
                      >
                        {r.loadNumber}
                      </Link>
                      <span>{formatDate(r.date) ?? "—"}</span>
                      <span>{r.role}</span>
                      <span>
                        {r.inT || r.outT ? (
                          <>
                            in {fmtTime(r.inT)} → out {fmtTime(r.outT)}{" "}
                            {clause && <span className={`text-[12px] ${clause.tone}`}>{clause.text}</span>}
                          </>
                        ) : (
                          <span className="text-faint">times not logged</span>
                        )}
                      </span>
                      <span className="text-right font-semibold text-ink tabular-nums">
                        {dwellStr ?? "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* notes */}
        <div className="ds2-board p-4 mt-[14px]">
          <PlateLabel>Your notes on this dock</PlateLabel>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Gate codes, who to call, where they stage oversize, which door — write it once, read it every time you're routed back."
            className="w-full mt-[10px] bg-well border border-hairline-lo rounded-[10px] px-[14px] py-[12px] text-[14px] leading-[1.55] text-ink placeholder:text-faint placeholder:font-condensed placeholder:text-[13px] outline-none resize-y"
            style={{ boxShadow: "inset 0 2px 6px rgba(0,0,0,.45)" }}
          />
          {notesDirty && (
            <button
              onClick={saveNotes}
              disabled={savingNotes}
              className="mt-2 h-[34px] px-[14px] rounded-[9px] font-condensed font-semibold text-[13.5px] tracking-[.04em] text-canvas disabled:opacity-50"
              style={{
                background: "linear-gradient(178deg, var(--color-hot), var(--color-amber))",
                boxShadow: "0 4px 10px rgba(232,148,10,.25)",
              }}
            >
              {savingNotes ? "SAVING…" : "SAVE NOTES"}
            </button>
          )}
        </div>

        {/* housekeeping */}
        <div className="ds2-board p-4 mt-[14px]">
          <PlateLabel>Housekeeping</PlateLabel>
          <div className="flex gap-[10px] items-center flex-wrap mt-[10px]">
            <p className="font-condensed text-[13px] text-faint flex-1 min-w-[220px]">
              Duplicate of another facility? Merge this one into it — its stops move
              over, then this card is deleted.
            </p>
            <select
              value={mergeTarget}
              onChange={(e) => setMergeTarget(e.target.value)}
              className="h-[34px] px-2 rounded-[9px] bg-well border border-hairline font-condensed text-[13px] text-ink outline-none max-w-[260px]"
            >
              <option value="">merge into…</option>
              {facilities
                .filter((f) => f.facility_id !== id)
                .map((f) => (
                  <option key={f.facility_id} value={f.facility_id}>
                    {facilityLabel(f)} · {f.city}, {f.state}
                  </option>
                ))}
            </select>
            <button
              onClick={doMerge}
              disabled={!mergeTarget || merging}
              className="h-[34px] px-[14px] rounded-[9px] font-condensed font-semibold text-[13px] text-dim bg-well border border-hairline disabled:opacity-40"
              style={{ boxShadow: "inset 0 1px 3px rgba(0,0,0,.5)" }}
            >
              {merging ? "MERGING…" : "MERGE"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FacilityDetailPage;
