import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type {
  ComplianceItem,
  ComplianceItemInput,
  ComplianceRenewal,
  ComplianceScope,
  LastRenewal,
  RenewalInput,
} from "@/types/compliance";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Trailer } from "@/types/trailer";
import {
  getComplianceItems,
  createComplianceItem,
  updateComplianceItem,
  deleteComplianceItem,
  renewComplianceItem,
  getComplianceRenewals,
  renewDriverCdl,
  getDriverCdlRenewals,
} from "@/services/complianceService";
import { getDrivers, patchDriver } from "@/services/driversService";
import { RenewSheet } from "@/components/compliance/RenewSheet";
import { earlierCount, errText, fmtDay, renewalLine } from "@/lib/compliance/renewal";
import { PrimaryButton } from "@/components/relationships/primitives";
import { getTrucks } from "@/services/trucksService";
import { getTrailers } from "@/services/trailersService";
import {
  computeComplianceDue,
  complianceSummary,
  itemToCheckable,
  cdlToCheckable,
  CDL_WARN_LEAD_DAYS,
  type ComplianceLevel,
} from "@/lib/metrics/compliance";
import { ComplianceItemForm } from "@/components/compliance/ComplianceItemForm";
import { SidebarTrigger } from "@/components/ui/sidebar";

const fmtDate = (d: string) =>
  new Date(d.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

const PILL: Record<ComplianceLevel, { label: string; fg: string }> = {
  valid: { label: "Valid", fg: "#6fd08c" },
  expiring: { label: "Expiring", fg: "#f5b03a" },
  expired: { label: "Expired", fg: "#e05252" },
  unknown: { label: "No date", fg: "#5a6880" },
};

// The paper's clock fill — elapsed share of its window. Window = issued→expires
// when issued is recorded, else the renewal cadence, else a year. Presentation
// only; the LEVEL always comes from computeComplianceDue.
const clockFill = (
  item: { issued_on?: string | null; renewal_months?: number | null },
  expiresOn: string | null,
  daysRemaining: number | null,
): number => {
  if (expiresOn == null || daysRemaining == null) return 0;
  let windowDays: number | null = null;
  if (item.issued_on) {
    windowDays =
      (Date.parse(expiresOn.slice(0, 10)) - Date.parse(item.issued_on.slice(0, 10))) /
      86_400_000;
  } else if (item.renewal_months) {
    windowDays = item.renewal_months * 30.44;
  } else {
    windowDays = 365;
  }
  if (!windowDays || windowDays <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - daysRemaining / windowDays));
};

const ClockCells = ({ fill, level }: { fill: number; level: ComplianceLevel }) => (
  <div className="flex gap-[3px]">
    {Array.from({ length: 14 }, (_, i) => {
      const on = (i + 1) / 14 <= fill + 1e-6;
      const hot = level === "expired";
      const warm = level === "expiring";
      return (
        <i
          key={i}
          className="flex-1 h-[9px] rounded-[2px]"
          style={
            on
              ? hot
                ? {
                    background: "linear-gradient(180deg, #ff8a8a, #e05252)",
                    border: "1px solid rgba(224,82,82,.6)",
                    boxShadow: "0 0 6px rgba(224,82,82,.35)",
                  }
                : warm
                  ? {
                      background: "linear-gradient(180deg, var(--color-hot), var(--color-amber))",
                      border: "1px solid rgba(245,176,58,.55)",
                      boxShadow: "0 0 6px rgba(232,148,10,.3)",
                    }
                  : {
                      background: "rgba(232,148,10,.4)",
                      border: "1px solid rgba(232,148,10,.3)",
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

const inputCls =
  "bg-well border border-hairline rounded-[8px] px-2 py-1.5 text-sm w-full text-ink outline-none";
const lbl = "font-condensed text-[11px] tracking-[.1em] uppercase text-faint mb-1 block";

const entityCol: Record<ComplianceScope, "driver_id" | "truck_id" | "trailer_id" | null> =
  { business: null, driver: "driver_id", truck: "truck_id", trailer: "trailer_id" };

// The line under a row — the newest closed cycle, with "n earlier" folding the
// rest. The newest cycle rides in on the list response, so this costs nothing
// until the fold is opened. Module-level: a component declared inside a render
// body is a new type every render, and React remounts it (and drops its state).
const RenewalHistoryLine = ({
  last,
  count,
  open,
  busy,
  rows,
  onToggle,
}: {
  last: LastRenewal | null | undefined;
  count: number | undefined;
  open: boolean;
  busy: boolean;
  rows: ComplianceRenewal[];
  onToggle: () => void;
}) => {
  const line = renewalLine(last);
  if (!line) return null;
  const earlier = earlierCount(count);
  return (
    <div className="mt-[5px]">
      <p className="font-condensed text-[12px] text-dim">
        {line}
        {earlier > 0 && (
          <button
            onClick={onToggle}
            className="ml-2 font-semibold text-amber-hi hover:text-hot"
          >
            {open ? "hide" : `${earlier} earlier`}
          </button>
        )}
      </p>
      {open && (
        <div className="mt-1 pl-2 border-l border-hairline">
          {busy ? (
            <p className="font-condensed text-[11.5px] text-faint">Loading…</p>
          ) : rows.length > 1 ? (
            // rows[0] is the cycle already printed above.
            rows.slice(1).map((r) => (
              <p key={r.renewal_id} className="font-condensed text-[11.5px] text-faint">
                renewed {fmtDay(r.renewed_on)}
                {r.expired_on ? ` · was due ${fmtDay(r.expired_on)}` : ""}
                {r.doc_number ? ` · #${r.doc_number}` : ""}
                {r.renewed_by_name ? ` · ${r.renewed_by_name}` : ""}
                {r.note ? ` · ${r.note}` : ""}
              </p>
            ))
          ) : (
            <p className="font-condensed text-[11.5px] text-faint">No earlier cycles.</p>
          )}
        </div>
      )}
    </div>
  );
};

const CompliancePage = () => {
  const [items, setItems] = useState<ComplianceItem[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Which section is mid-add (scope + optional entity id), and which item is
  // mid-edit / which driver's CDL is being edited.
  const [adding, setAdding] = useState<{ scope: ComplianceScope; entityId: string | null } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cdlDriver, setCdlDriver] = useState<Driver | null>(null);

  // Which subject the renew sheet is open on — a paper, or a driver's CDL.
  const [renewing, setRenewing] = useState<
    { kind: "item"; item: ComplianceItem } | { kind: "cdl"; driver: Driver } | null
  >(null);
  // The "n earlier" fold: one open at a time, its rows fetched when it opens.
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [historyRows, setHistoryRows] = useState<ComplianceRenewal[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  // Which fold ASKED for the rows in flight. There is one rows slot for every
  // fold, so a slow answer for a fold that has since been closed (or for the
  // previous fold, when a second one was opened) would land in whatever is
  // open now — another paper's history under this paper's row. A ref, not
  // state: it has to be readable by a closure that started before the change.
  const historyReq = useRef<string | null>(null);

  const load = () =>
    Promise.all([getComplianceItems(), getDrivers(), getTrucks(), getTrailers()])
      .then(([ci, dr, tr, tl]) => {
        setItems(ci);
        setDrivers(dr);
        setTrucks(tr);
        setTrailers(tl);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const now = new Date();
  const checkables = [
    ...items.map(itemToCheckable),
    ...drivers.filter((d) => d.cdl_expiration).map(cdlToCheckable),
  ];
  const summary = complianceSummary(checkables, now);

  const closeForms = () => {
    setAdding(null);
    setEditingId(null);
    setCdlDriver(null);
    setRenewing(null);
    setError(null);
  };

  // One sheet, two endpoints: a paper renews through /compliance, the CDL
  // through the driver record. Either way the list refetches, so the row's
  // clock cells and its history line come back from the server, not from here.
  const saveRenewal = async (body: RenewalInput) => {
    if (!renewing) return;
    setBusy(true);
    setError(null);
    try {
      if (renewing.kind === "item")
        await renewComplianceItem(renewing.item.compliance_item_id, body);
      else await renewDriverCdl(renewing.driver.driver_id, body);
      closeForms();
      // Whatever the fold was showing is a cycle behind — close it, and void
      // any history fetch still in flight so it can't repopulate it.
      historyReq.current = null;
      setOpenHistory(null);
      await load();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  // Opening a fold fetches its cycles; opening another closes the first. Every
  // answer is checked against `historyReq` before it is allowed to land, so a
  // response that arrives after its fold was closed is dropped rather than
  // shown under whatever fold is open now.
  const toggleHistory = async (
    key: string,
    fetchRows: () => Promise<ComplianceRenewal[]>,
  ) => {
    if (openHistory === key) {
      historyReq.current = null;
      setOpenHistory(null);
      return;
    }
    historyReq.current = key;
    setOpenHistory(key);
    setHistoryRows([]);
    setHistoryBusy(true);
    try {
      const rows = await fetchRows();
      if (historyReq.current !== key) return;
      setHistoryRows(rows);
    } catch {
      if (historyReq.current !== key) return;
      setHistoryRows([]);
    } finally {
      // The fold that asked is the only one whose spinner this answer ends.
      if (historyReq.current === key) setHistoryBusy(false);
    }
  };

  const saveNew = async (
    scope: ComplianceScope,
    entityId: string | null,
    data: Omit<ComplianceItemInput, "scope">,
  ) => {
    setBusy(true);
    setError(null);
    try {
      const col = entityCol[scope];
      const payload: ComplianceItemInput = { scope, ...data };
      if (col && entityId) payload[col] = entityId;
      await createComplianceItem(payload);
      closeForms();
      await load();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (id: string, data: Omit<ComplianceItemInput, "scope">) => {
    setBusy(true);
    setError(null);
    try {
      await updateComplianceItem(id, data);
      closeForms();
      await load();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await deleteComplianceItem(id);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const saveCdl = async (driver: Driver, patch: Partial<Driver>) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await patchDriver(driver.driver_id, patch);
      // Merge, don't replace: PATCH /drivers answers with the driver row alone,
      // and a straight swap would drop the renewal fields the LIST carried in
      // (the CDL row's history line would vanish until the next refetch).
      setDrivers((ds) =>
        ds.map((d) => (d.driver_id === driver.driver_id ? { ...d, ...updated } : d)),
      );
      closeForms();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const itemRow = (item: ComplianceItem) => {
    const due = computeComplianceDue(item, now);
    const pill = PILL[due.level];
    return (
      <div key={item.compliance_item_id} className="px-4 py-3 border-t ds2-cell-rule">
        <div className="flex justify-between items-baseline gap-3 mb-[7px] flex-wrap">
          <span className="font-condensed font-semibold text-[14.5px] min-w-0 flex items-center gap-2 flex-wrap">
            {item.label}
            {item.category && (
              <span className="font-bold text-[10px] tracking-[.1em] px-[7px] py-[2px] rounded-[4px] text-faint border border-hairline uppercase">
                {item.category}
              </span>
            )}
          </span>
          <span className="flex items-center gap-3 shrink-0">
            <span
              className="font-condensed font-semibold text-[13px] tabular-nums"
              style={{ color: pill.fg }}
            >
              {due.daysRemaining != null
                ? due.daysRemaining < 0
                  ? `${Math.abs(due.daysRemaining)} days ago`
                  : `${due.daysRemaining} days`
                : "no date"}
              {due.expiresOn ? ` · ${fmtDate(due.expiresOn)}` : ""}
            </span>
            <PrimaryButton
              size="sm"
              onClick={() => {
                closeForms();
                setRenewing({ kind: "item", item });
              }}
            >
              Mark renewed
            </PrimaryButton>
            <button
              onClick={() => {
                closeForms();
                setEditingId(item.compliance_item_id);
              }}
              className="font-condensed font-semibold text-[11px] tracking-[.08em] text-dim hover:text-ink"
            >
              EDIT
            </button>
            <button
              aria-label="Delete"
              onClick={() => remove(item.compliance_item_id)}
              className="font-condensed text-[13px] text-faint hover:text-[#e05252]"
            >
              ✕
            </button>
          </span>
        </div>
        <ClockCells fill={clockFill(item, due.expiresOn, due.daysRemaining)} level={due.level} />
        <p className="font-condensed text-[10.5px] text-faint mt-[5px]">
          {item.doc_number ? `#${item.doc_number} · ` : ""}
          {item.renewal_months ? `renews every ${item.renewal_months} mo · ` : ""}
          warns inside {item.warn_lead_days ?? 30} days
        </p>
        <RenewalHistoryLine
          last={item.last_renewal}
          count={item.renewal_count}
          open={openHistory === item.compliance_item_id}
          busy={historyBusy}
          rows={historyRows}
          onToggle={() =>
            toggleHistory(item.compliance_item_id, () =>
              getComplianceRenewals(item.compliance_item_id),
            )
          }
        />
      </div>
    );
  };

  // The CDL row is backed by the driver record: editable here, read-only on the
  // driver page. Its own due is computed off cdl_expiration.
  const cdlRow = (driver: Driver) => {
    const due = computeComplianceDue(
      { expires_on: driver.cdl_expiration, warn_lead_days: CDL_WARN_LEAD_DAYS },
      now,
    );
    const pill = PILL[due.level];
    return (
      <div key={`cdl-${driver.driver_id}`} className="px-4 py-3 border-t ds2-cell-rule first:border-t-0">
        <div className="flex justify-between items-baseline gap-3 mb-[7px] flex-wrap">
          <span className="font-condensed font-semibold text-[14.5px] min-w-0 flex items-center gap-2 flex-wrap">
            CDL{driver.cdl_number ? ` · ${driver.cdl_number}` : ""}
            {driver.cdl_state ? ` (${driver.cdl_state})` : ""}
            <span className="font-bold text-[10px] tracking-[.1em] px-[7px] py-[2px] rounded-[4px] text-faint border border-hairline uppercase">
              license
            </span>
          </span>
          <span className="flex items-center gap-3 shrink-0">
            <span
              className="font-condensed font-semibold text-[13px] tabular-nums"
              style={{ color: pill.fg }}
            >
              {due.daysRemaining != null
                ? due.daysRemaining < 0
                  ? `${Math.abs(due.daysRemaining)} days ago`
                  : `${due.daysRemaining} days`
                : "no date"}
              {due.expiresOn ? ` · ${fmtDate(due.expiresOn)}` : ""}
            </span>
            <PrimaryButton
              size="sm"
              onClick={() => {
                closeForms();
                setRenewing({ kind: "cdl", driver });
              }}
            >
              Mark renewed
            </PrimaryButton>
            <button
              onClick={() => {
                closeForms();
                setCdlDriver(driver);
              }}
              className="font-condensed font-semibold text-[11px] tracking-[.08em] text-dim hover:text-ink"
            >
              EDIT
            </button>
          </span>
        </div>
        <ClockCells
          fill={clockFill({ issued_on: null, renewal_months: null }, due.expiresOn, due.daysRemaining)}
          level={due.level}
        />
        <p className="font-condensed text-[10.5px] text-faint mt-[5px]">
          {driver.endorsements ? `endorsements ${driver.endorsements} · ` : ""}
          from the driver record — the same clock as the dossier's papers plate · warns
          inside {CDL_WARN_LEAD_DAYS} days
        </p>
        <RenewalHistoryLine
          last={driver.last_cdl_renewal}
          count={driver.cdl_renewal_count}
          open={openHistory === `cdl-${driver.driver_id}`}
          busy={historyBusy}
          rows={historyRows}
          onToggle={() =>
            toggleHistory(`cdl-${driver.driver_id}`, () =>
              getDriverCdlRenewals(driver.driver_id),
            )
          }
        />
      </div>
    );
  };

  const section = (
    key: string,
    title: string,
    scope: ComplianceScope,
    entityId: string | null,
    link: string | null,
    rows: ComplianceItem[],
    leadRow?: React.ReactNode,
  ) => (
    <div key={key} className="ds2-board overflow-hidden mt-4">
      <div className="flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule">
        <span className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
          {title}
        </span>
        {link && (
          <Link
            to={link}
            className="font-condensed text-[11px] text-faint hover:text-amber-hi tracking-[.06em]"
          >
            OPEN →
          </Link>
        )}
        <span className="flex-1" />
        <button
          className="font-condensed font-semibold text-[12px] tracking-[.06em] text-amber-hi hover:text-hot"
          onClick={() => {
            closeForms();
            setAdding({ scope, entityId });
          }}
        >
          + ADD PAPER
        </button>
      </div>
      {leadRow}
      {rows.map(itemRow)}
      {leadRow == null && rows.length === 0 && (
        <p className="font-condensed text-[13px] text-faint px-4 py-3">
          Nothing tracked yet.
        </p>
      )}
    </div>
  );

  const grounded = summary.status === "grounded";
  const editingItem = editingId
    ? (items.find((i) => i.compliance_item_id === editingId) ?? null)
    : null;

  // The soonest clock — the answering line's "next up".
  const nextUp = (() => {
    let best: { label: string; days: number } | null = null;
    for (const it of items) {
      const d = computeComplianceDue(it, now);
      if (d.daysRemaining != null && (best == null || d.daysRemaining < best.days))
        best = { label: it.label, days: d.daysRemaining };
    }
    for (const d of drivers) {
      const due = computeComplianceDue(
        { expires_on: d.cdl_expiration, warn_lead_days: CDL_WARN_LEAD_DAYS },
        now,
      );
      if (due.daysRemaining != null && (best == null || due.daysRemaining < best.days))
        best = { label: "CDL", days: due.daysRemaining };
    }
    return best;
  })();

  const modalOpen =
    adding != null || editingItem != null || cdlDriver != null || renewing != null;

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">COMPLIANCE</h1>
          <span className="font-condensed font-medium text-[15px] text-dim">
            the papers that keep you legal
          </span>
        </div>

        {/* answering line */}
        <div className="flex items-center gap-3 flex-wrap mt-4 font-condensed">
          <span className="font-display text-[21px] tracking-[.03em] tabular-nums">
            {summary.valid + summary.expiring + summary.expired} PAPERS
          </span>
          <span
            className="font-forge font-bold text-[14px] tracking-[.14em] rounded-[8px] px-3 py-[2px] rotate-[-2deg] border-2"
            style={
              grounded
                ? { color: "#e05252", borderColor: "#e05252", boxShadow: "inset 0 0 12px rgba(224,82,82,.12)" }
                : { color: "#6fd08c", borderColor: "#6fd08c", boxShadow: "inset 0 0 12px rgba(111,208,140,.12)" }
            }
          >
            {grounded ? "GROUNDED" : summary.expiring > 0 ? "CLEARED TO ROLL" : "ALL CLEAR"}
          </span>
          {summary.expired > 0 && (
            <span className="font-bold text-[11px] tracking-[.1em] px-[10px] py-[3px] rounded-full text-[#e05252] border border-[rgba(224,82,82,.35)] bg-[rgba(224,82,82,.08)]">
              {summary.expired} EXPIRED
            </span>
          )}
          {summary.expiring > 0 && (
            <span className="font-bold text-[11px] tracking-[.1em] px-[10px] py-[3px] rounded-full text-amber-hi border border-[rgba(232,148,10,.35)] bg-[rgba(232,148,10,.08)]">
              {summary.expiring} EXPIRING
            </span>
          )}
          {nextUp && (
            <span className="text-[13.5px] text-faint">
              · next up: <b className="font-semibold text-ink">{nextUp.label}</b> ·{" "}
              <b className="font-semibold text-ink tabular-nums">{nextUp.days} days</b>
            </span>
          )}
        </div>

        {loading ? (
          <p className="font-condensed text-[13px] text-faint mt-6">Loading…</p>
        ) : (
          <>
            {section("business", "Business · Delgado Trucking Services", "business", null, null,
              items.filter((i) => i.scope === "business"))}

            {drivers.map((d) =>
              section(
                `driver-${d.driver_id}`,
                `Driver · ${d.first_name} ${d.last_name}`.trim(),
                "driver",
                d.driver_id,
                `/drivers/${d.driver_id}`,
                items.filter((i) => i.scope === "driver" && i.driver_id === d.driver_id),
                cdlRow(d),
              ),
            )}

            {trucks.map((t) =>
              section(
                `truck-${t.truck_id}`,
                `Truck · Unit ${t.unit_number}`,
                "truck",
                t.truck_id,
                `/trucks/${t.truck_id}`,
                items.filter((i) => i.scope === "truck" && i.truck_id === t.truck_id),
              ),
            )}

            {trailers.map((t) =>
              section(
                `trailer-${t.trailer_id}`,
                `Trailer · Unit ${t.unit_number}`,
                "trailer",
                t.trailer_id,
                `/trailers/${t.trailer_id}`,
                items.filter((i) => i.scope === "trailer" && i.trailer_id === t.trailer_id),
              ),
            )}
          </>
        )}

        {/* the popup — add, edit, and the CDL editor, one forged modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={closeForms} />
            <div className="relative w-full max-w-[560px] mx-4 max-h-[90vh] overflow-y-auto bg-canvas text-ink rounded-[12px] border border-hairline shadow-xl">
              <div
                className="flex items-center gap-3 px-5 py-[14px] border-b ds2-cell-rule"
                style={{ background: "linear-gradient(90deg, rgba(232,148,10,.08), transparent 55%)" }}
              >
                <span className="font-forge font-bold text-[19px]" style={{ letterSpacing: "1.5px" }}>
                  {renewing
                    ? "MARK RENEWED"
                    : cdlDriver
                      ? "EDIT CDL"
                      : editingItem
                        ? "EDIT PAPER"
                        : "ADD PAPER"}
                </span>
                <button className="ml-auto text-faint hover:text-ink" aria-label="Close" onClick={closeForms}>
                  ✕
                </button>
              </div>
              <div className="p-5">
                {renewing ? (
                  // `key` forces a remount when the sheet moves to another
                  // subject: the prefills are useState initializers and only
                  // run on mount.
                  <RenewSheet
                    key={
                      renewing.kind === "item"
                        ? renewing.item.compliance_item_id
                        : `cdl-${renewing.driver.driver_id}`
                    }
                    subject={
                      renewing.kind === "item"
                        ? renewing.item.label
                        : `CDL${renewing.driver.cdl_number ? ` · ${renewing.driver.cdl_number}` : ""}`
                    }
                    currentExpiry={
                      renewing.kind === "item"
                        ? renewing.item.expires_on
                        : renewing.driver.cdl_expiration
                    }
                    // A driver record carries no cadence, so the CDL sheet asks
                    // for the expiry instead of guessing at it.
                    renewalMonths={
                      renewing.kind === "item" ? renewing.item.renewal_months : null
                    }
                    currentDocNumber={
                      renewing.kind === "item"
                        ? renewing.item.doc_number
                        : renewing.driver.cdl_number
                    }
                    docLabel={renewing.kind === "cdl" ? "New CDL #" : "New document #"}
                    onRenew={saveRenewal}
                    onCancel={closeForms}
                    busy={busy}
                    error={error}
                  />
                ) : cdlDriver ? (
                  <CdlForm
                    driver={cdlDriver}
                    onSave={saveCdl}
                    onCancel={closeForms}
                    busy={busy}
                    error={error}
                  />
                ) : editingItem ? (
                  <ComplianceItemForm
                    scope={editingItem.scope}
                    initial={editingItem}
                    onSave={(d) => saveEdit(editingItem.compliance_item_id, d)}
                    onCancel={closeForms}
                    busy={busy}
                    error={error}
                  />
                ) : adding ? (
                  <ComplianceItemForm
                    scope={adding.scope}
                    onSave={(d) => saveNew(adding.scope, adding.entityId, d)}
                    onCancel={closeForms}
                    busy={busy}
                    error={error}
                  />
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// The CDL editor — writes the four CDL fields back to the driver record.
const CdlForm = ({
  driver,
  onSave,
  onCancel,
  busy,
  error,
}: {
  driver: Driver;
  onSave: (d: Driver, patch: Partial<Driver>) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
}) => {
  const [number, setNumber] = useState(driver.cdl_number ?? "");
  const [state, setState] = useState(driver.cdl_state ?? "");
  const [exp, setExp] = useState(driver.cdl_expiration?.slice(0, 10) ?? "");
  const [endorsements, setEndorsements] = useState(driver.endorsements ?? "");
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={lbl}>CDL #</label>
          <input className={inputCls} value={number} onChange={(e) => setNumber(e.target.value)} />
        </div>
        <div>
          <label className={lbl}>State</label>
          <input className={inputCls} value={state} maxLength={2} placeholder="AL" onChange={(e) => setState(e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Expires</label>
          <input type="date" className={inputCls} value={exp} onChange={(e) => setExp(e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Endorsements</label>
          <input className={inputCls} value={endorsements} placeholder="H, N, T" onChange={(e) => setEndorsements(e.target.value)} />
        </div>
      </div>
      {error && <p className="text-destructive text-sm mt-2">{error}</p>}
      <div className="flex gap-2 justify-end mt-4">
        <button
          className="h-9 px-4 rounded-[9px] font-condensed font-semibold text-[13.5px] text-dim bg-well border border-hairline"
          onClick={onCancel}
        >
          CANCEL
        </button>
        <button
          className="h-9 px-4 rounded-[9px] font-condensed font-semibold text-[13.5px] text-canvas disabled:opacity-50"
          style={{ background: "linear-gradient(178deg, var(--color-hot), var(--color-amber))" }}
          disabled={busy}
          onClick={() =>
            onSave(driver, {
              cdl_number: number.trim() || null,
              cdl_state: state.trim().toUpperCase() || null,
              cdl_expiration: exp || null,
              endorsements: endorsements.trim() || null,
            })
          }
        >
          {busy ? "SAVING…" : "SAVE CDL"}
        </button>
      </div>
    </div>
  );
};

export default CompliancePage;
