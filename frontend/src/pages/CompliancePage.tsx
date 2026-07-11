import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  User,
  Truck as TruckIcon,
  Container,
  HeartPulse,
  ShieldCheck,
  ClipboardCheck,
  Receipt,
  FileText,
  BadgeCheck,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  ComplianceItem,
  ComplianceItemInput,
  ComplianceScope,
} from "@/types/compliance";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Trailer } from "@/types/trailer";
import {
  getComplianceItems,
  createComplianceItem,
  updateComplianceItem,
  deleteComplianceItem,
} from "@/services/complianceService";
import { getDrivers, patchDriver } from "@/services/driversService";
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
import { Kpi } from "@/components/Kpi";
import { Stamp } from "@/components/Stamp";
import { ComplianceItemForm } from "@/components/compliance/ComplianceItemForm";

const fmtDate = (d: string) =>
  new Date(d.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

const catIcon = (cat: string | null): LucideIcon =>
  (
    ({
      medical: HeartPulse,
      license: BadgeCheck,
      registration: FileText,
      inspection: ClipboardCheck,
      tax: Receipt,
      insurance: ShieldCheck,
      authority: Building2,
    }) as Record<string, LucideIcon>
  )[cat ?? ""] ?? FileText;

const PILL: Record<ComplianceLevel, { label: string; bg: string; fg: string }> = {
  valid: { label: "Valid", bg: "#1a3a2a", fg: "#4ade80" },
  expiring: { label: "Expiring", bg: "#3a2a0a", fg: "#e8940a" },
  expired: { label: "Expired", bg: "#3a1a1a", fg: "#f87171" },
  unknown: { label: "No date", bg: "#1a2a3a", fg: "#60a5fa" },
};

const inputCls = "bg-steel rounded px-2 py-1.5 text-sm w-full text-light";
const lbl = "text-xs text-muted-text mb-1 block";

const entityCol: Record<ComplianceScope, "driver_id" | "truck_id" | "trailer_id" | null> =
  { business: null, driver: "driver_id", truck: "truck_id", trailer: "trailer_id" };

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
    setError(null);
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
      setDrivers((ds) => ds.map((d) => (d.driver_id === driver.driver_id ? updated : d)));
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
    const Icon = catIcon(item.category);
    if (editingId === item.compliance_item_id)
      return (
        <div key={item.compliance_item_id} className="border-t border-[#3b4660] pt-2">
          <ComplianceItemForm
            scope={item.scope}
            initial={item}
            onSave={(d) => saveEdit(item.compliance_item_id, d)}
            onCancel={closeForms}
            busy={busy}
            error={error}
          />
        </div>
      );
    return (
      <div
        key={item.compliance_item_id}
        className="flex items-center gap-3 py-3 border-t border-[#3b4660]"
      >
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: pill.bg, color: pill.fg }}
        >
          <Icon size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="truncate">{item.label}</p>
          <p className="text-xs text-muted-text truncate">
            {item.doc_number ? `#${item.doc_number}` : item.category || ""}
            {item.renewal_months ? ` · renews every ${item.renewal_months} mo` : ""}
          </p>
        </div>
        <div className="text-right shrink-0 min-w-[92px]">
          <p className="text-xs text-muted-text whitespace-nowrap">
            {due.expiresOn ? fmtDate(due.expiresOn) : "no date"}
          </p>
          {due.daysRemaining != null && (
            <p className="text-[11px]" style={{ color: pill.fg }}>
              {due.daysRemaining < 0
                ? `${Math.abs(due.daysRemaining)}d ago`
                : `${due.daysRemaining}d left`}
            </p>
          )}
        </div>
        <span
          className="text-[11px] px-2 py-0.5 rounded-full shrink-0"
          style={{ background: pill.bg, color: pill.fg }}
        >
          {pill.label}
        </span>
        <div className="flex gap-1.5 shrink-0">
          <Pencil
            size={14}
            className="cursor-pointer text-muted-text hover:text-light"
            aria-label="Edit"
            onClick={() => {
              closeForms();
              setEditingId(item.compliance_item_id);
            }}
          />
          <Trash2
            size={14}
            className="cursor-pointer text-muted-text hover:text-destructive"
            aria-label="Delete"
            onClick={() => remove(item.compliance_item_id)}
          />
        </div>
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
    if (cdlDriver?.driver_id === driver.driver_id)
      return <CdlForm key="cdl-edit" driver={driver} onSave={saveCdl} onCancel={closeForms} busy={busy} error={error} />;
    return (
      <div key={`cdl-${driver.driver_id}`} className="flex items-center gap-3 py-3 border-t border-[#3b4660]">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: pill.bg, color: pill.fg }}>
          <BadgeCheck size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="truncate">CDL{driver.cdl_number ? ` · ${driver.cdl_number}` : ""}{driver.cdl_state ? ` (${driver.cdl_state})` : ""}</p>
          <p className="text-xs text-muted-text truncate">
            {driver.endorsements ? `endorsements: ${driver.endorsements}` : "commercial driver license"}
          </p>
        </div>
        <div className="text-right shrink-0 min-w-[92px]">
          <p className="text-xs text-muted-text whitespace-nowrap">
            {due.expiresOn ? fmtDate(due.expiresOn) : "no date"}
          </p>
          {due.daysRemaining != null && (
            <p className="text-[11px]" style={{ color: pill.fg }}>
              {due.daysRemaining < 0 ? `${Math.abs(due.daysRemaining)}d ago` : `${due.daysRemaining}d left`}
            </p>
          )}
        </div>
        <span className="text-[11px] px-2 py-0.5 rounded-full shrink-0" style={{ background: pill.bg, color: pill.fg }}>
          {pill.label}
        </span>
        <div className="flex gap-1.5 shrink-0">
          <Pencil size={14} className="cursor-pointer text-muted-text hover:text-light" aria-label="Edit CDL" onClick={() => { closeForms(); setCdlDriver(driver); }} />
        </div>
      </div>
    );
  };

  const section = (
    key: string,
    title: string,
    Icon: LucideIcon,
    scope: ComplianceScope,
    entityId: string | null,
    link: string | null,
    rows: ComplianceItem[],
    leadRow?: React.ReactNode,
  ) => {
    const isAdding = adding?.scope === scope && adding?.entityId === entityId;
    return (
      <div key={key} className="bg-plate rounded-lg px-4 pb-3 pt-1 mt-4">
        <div className="flex items-center gap-2 py-3">
          <Icon size={18} className="text-amber-light" />
          <span className="font-condensed text-lg">{title}</span>
          {link && (
            <Link to={link} className="text-xs text-status-info-text hover:underline flex items-center gap-0.5">
              <ExternalLink size={12} />
            </Link>
          )}
          <span className="flex-1" />
          <button
            className="text-amber border border-amber rounded px-2 py-0.5 text-xs font-condensed uppercase tracking-wide flex items-center gap-1"
            onClick={() => {
              closeForms();
              setAdding({ scope, entityId });
            }}
          >
            <Plus size={13} /> Add
          </button>
        </div>
        {leadRow}
        {rows.map(itemRow)}
        {leadRow == null && rows.length === 0 && !isAdding && (
          <p className="text-sm text-muted-text py-2 border-t border-[#3b4660]">
            Nothing tracked yet.
          </p>
        )}
        {isAdding && (
          <div className="border-t border-[#3b4660] pt-2">
            <ComplianceItemForm
              scope={scope}
              onSave={(d) => saveNew(scope, entityId, d)}
              onCancel={closeForms}
              busy={busy}
              error={error}
            />
          </div>
        )}
      </div>
    );
  };

  const grounded = summary.status === "grounded";

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <div className="flex justify-between items-start gap-3 flex-wrap mb-2">
        <div>
          <h1 className="text-3xl font-condensed">Compliance</h1>
          <p className="text-xs text-muted-text">Road-legal status · Delgado Trucking Services</p>
        </div>
        <div className="text-right">
          <Stamp
            label={grounded ? "Grounded" : "Cleared to roll"}
            color={grounded ? "#f87171" : "#4ade80"}
          />
          <p className="text-[11px] text-muted-text mt-1">
            {summary.expired > 0
              ? `${summary.expired} expired · ${summary.expiring} expiring soon`
              : summary.expiring > 0
                ? `${summary.expiring} document${summary.expiring > 1 ? "s" : ""} expiring soon`
                : "All documents current"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-4">
        <Kpi label="Valid" value={String(summary.valid)} valueClass="text-status-positive-text" />
        <Kpi label="Expiring soon" value={String(summary.expiring)} valueClass={summary.expiring ? "text-amber" : "text-light"} />
        <Kpi label="Expired" value={String(summary.expired)} valueClass={summary.expired ? "text-destructive" : "text-light"} />
      </div>

      {loading ? (
        <p className="text-sm text-muted-text mt-6">Loading…</p>
      ) : (
        <>
          {section("business", "Business", Building2, "business", null, null,
            items.filter((i) => i.scope === "business"))}

          {drivers.map((d) =>
            section(
              `driver-${d.driver_id}`,
              `Driver · ${d.first_name} ${d.last_name}`.trim(),
              User,
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
              `Vehicle · Unit ${t.unit_number}`,
              TruckIcon,
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
              Container,
              "trailer",
              t.trailer_id,
              `/trailers/${t.trailer_id}`,
              items.filter((i) => i.scope === "trailer" && i.trailer_id === t.trailer_id),
            ),
          )}
        </>
      )}
    </div>
  );
};

// Inline CDL editor — writes the four CDL fields back to the driver record.
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
    <div className="bg-steel rounded-lg p-3 border-t border-[#3b4660]">
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
      <div className="flex gap-2 mt-3">
        <button
          className="bg-amber text-steel px-3 py-1.5 rounded text-sm font-semibold disabled:opacity-50"
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
          {busy ? "Saving…" : "Save CDL"}
        </button>
        <button className="bg-plate text-light px-3 py-1.5 rounded text-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
};

const errText = (e: unknown): string =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
  "Could not save";

export default CompliancePage;
