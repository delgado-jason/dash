import { useState } from "react";
import type {
  ComplianceItem,
  ComplianceItemInput,
  ComplianceScope,
} from "@/types/compliance";
import { Panel } from "@/components/ui/Panel";

const inputCls = "bg-well rounded px-2 py-1.5 text-sm w-full text-ink";
const lbl = "text-xs text-faint mb-1 block";

export const CATEGORIES = [
  "license",
  "medical",
  "registration",
  "inspection",
  "tax",
  "insurance",
  "authority",
  "other",
];

// Sentinel for the "type your own category" option. Distinct from the generic
// "other" category above — this reveals a free-text box (permits, bonds, etc.).
const CUSTOM_CATEGORY = "__custom__";

type Preset = {
  label: string;
  category: string;
  renewal_months?: number;
  warn?: number;
};

// Common owner-operator docs per section, so adding one is mostly entering a
// date rather than typing labels from scratch.
export const PRESETS: Record<ComplianceScope, Preset[]> = {
  business: [
    { label: "LLC annual report", category: "authority", renewal_months: 12 },
    { label: "UCR registration", category: "authority", renewal_months: 12 },
    { label: "IFTA license", category: "authority", renewal_months: 12 },
    {
      label: "MCS-150 biennial update",
      category: "authority",
      renewal_months: 24,
    },
    { label: "BOC-3 process agent", category: "authority" },
    {
      label: "Drug & alcohol consortium",
      category: "other",
      renewal_months: 12,
    },
  ],
  driver: [
    {
      label: "Medical card (DOT physical)",
      category: "medical",
      renewal_months: 24,
      warn: 45,
    },
    { label: "TWIC card", category: "license", renewal_months: 60, warn: 60 },
    {
      label: "Hazmat endorsement",
      category: "license",
      renewal_months: 60,
      warn: 60,
    },
    { label: "MVR / annual review", category: "other", renewal_months: 12 },
  ],
  truck: [
    {
      label: "Apportioned registration (IRP)",
      category: "registration",
      renewal_months: 12,
      warn: 45,
    },
    {
      label: "Annual DOT inspection",
      category: "inspection",
      renewal_months: 12,
    },
    { label: "HVUT Form 2290", category: "tax", renewal_months: 12, warn: 45 },
    {
      label: "State registration",
      category: "registration",
      renewal_months: 12,
    },
  ],
  trailer: [
    {
      label: "Annual DOT inspection",
      category: "inspection",
      renewal_months: 12,
    },
    { label: "Registration", category: "registration", renewal_months: 12 },
  ],
};

interface Props {
  scope: ComplianceScope;
  initial?: ComplianceItem | null;
  onSave: (data: Omit<ComplianceItemInput, "scope">) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
}

export const ComplianceItemForm = ({
  scope,
  initial,
  onSave,
  onCancel,
  busy,
  error,
}: Props) => {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  // An existing item with a category outside the common list opens straight into
  // the custom text box (e.g. a permit added earlier).
  const [categoryIsCustom, setCategoryIsCustom] = useState(
    () => !!initial?.category && !CATEGORIES.includes(initial.category),
  );
  const [expiresOn, setExpiresOn] = useState(
    initial?.expires_on?.slice(0, 10) ?? "",
  );
  const [warnDays, setWarnDays] = useState(
    String(initial?.warn_lead_days ?? 30),
  );
  const [renewal, setRenewal] = useState(
    initial?.renewal_months != null ? String(initial.renewal_months) : "",
  );
  const [docNumber, setDocNumber] = useState(initial?.doc_number ?? "");
  const [local, setLocal] = useState<string | null>(null);

  const applyPreset = (name: string) => {
    const p = PRESETS[scope].find((x) => x.label === name);
    if (!p) return;
    setLabel(p.label);
    setCategory(p.category);
    if (p.renewal_months != null) setRenewal(String(p.renewal_months));
    if (p.warn != null) setWarnDays(String(p.warn));
  };

  const submit = async () => {
    setLocal(null);
    if (!label.trim()) {
      setLocal("Give the document a name.");
      return;
    }
    await onSave({
      label: label.trim(),
      category: category || null,
      expires_on: expiresOn || null,
      warn_lead_days: parseInt(warnDays, 10) || 30,
      renewal_months: renewal ? parseInt(renewal, 10) : null,
      doc_number: docNumber.trim() || null,
    });
  };

  return (
    <Panel variant="panel" className="p-3 mt-2">
      {!initial && (
        <div className="mb-3">
          <label className={lbl}>
            Start from a common doc{" "}
            <span className="text-faint">
              (optional — or just type your own below)
            </span>
          </label>
          <select
            className={inputCls}
            defaultValue=""
            onChange={(e) => applyPreset(e.target.value)}
          >
            <option value="">Choose…</option>
            {PRESETS[scope].map((p) => (
              <option key={p.label} value={p.label}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className={lbl}>Document</label>
          <input
            className={inputCls}
            value={label}
            placeholder="Medical card (DOT physical)"
            maxLength={120}
            onChange={(e) => setLabel(e.target.value)}
          />
          <p className="text-[11px] text-faint mt-1">
            Type anything — it doesn't have to be on the list.
          </p>
        </div>
        <div>
          <label className={lbl}>Expires</label>
          <input
            type="date"
            className={inputCls}
            value={expiresOn}
            onChange={(e) => setExpiresOn(e.target.value)}
          />
        </div>
        <div>
          <label className={lbl}>Category</label>
          <select
            className={inputCls}
            value={categoryIsCustom ? CUSTOM_CATEGORY : category}
            onChange={(e) => {
              if (e.target.value === CUSTOM_CATEGORY) {
                setCategoryIsCustom(true);
                setCategory("");
              } else {
                setCategoryIsCustom(false);
                setCategory(e.target.value);
              }
            }}
          >
            <option value="">—</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value={CUSTOM_CATEGORY}>Other (type your own)…</option>
          </select>
          {categoryIsCustom && (
            <input
              className={`${inputCls} mt-1`}
              value={category}
              placeholder="e.g. permit"
              maxLength={40}
              onChange={(e) => setCategory(e.target.value)}
            />
          )}
        </div>
        <div>
          <label className={lbl}>Warn me (days before)</label>
          <input
            className={inputCls}
            value={warnDays}
            inputMode="numeric"
            onChange={(e) => setWarnDays(e.target.value)}
          />
        </div>
        <div>
          <label className={lbl}>Renews every (months)</label>
          <input
            className={inputCls}
            value={renewal}
            inputMode="numeric"
            placeholder="12"
            onChange={(e) => setRenewal(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={lbl}>Reference # (optional)</label>
          <input
            className={inputCls}
            value={docNumber}
            onChange={(e) => setDocNumber(e.target.value)}
          />
        </div>
      </div>
      {(local || error) && (
        <p className="text-destructive text-sm mt-2">{local || error}</p>
      )}
      <div className="flex gap-2 mt-3">
        <button
          className="bg-amber text-steel px-3 py-1.5 rounded text-sm font-semibold disabled:opacity-50"
          onClick={submit}
          disabled={busy}
        >
          {busy ? "Saving…" : initial ? "Save" : "Add document"}
        </button>
        <button
          className="bg-well text-ink px-3 py-1.5 rounded text-sm"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </Panel>
  );
};
