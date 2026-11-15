import { useEffect, useState } from "react";
import type { MaintenanceIssue, IssueSeverity, MaintenanceUnit } from "@/types/maintenance";
import {
  createMaintenanceIssue,
  closeMaintenanceIssue,
  reopenMaintenanceIssue,
  deleteMaintenanceIssue,
} from "@/services/maintenanceIssuesService";
import { SEVERITIES, sortIssues, daysOpen } from "@/lib/maintenance/issues";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";
import { FieldLabel, PrimaryButton, GhostButton } from "@/components/relationships/primitives";

// OPEN ISSUES (the Maintenance sheet, call 6): a defect noticed on the road —
// a warning light, an air leak, a tire wearing — with the day and how urgent,
// closed by the service that fixed it (through the log sheet) or by hand.
// The Oct 30 "warning lights on dash" lived nowhere until it was a $4,710
// invoice; this is the place between "scheduled" and "logged".

const TONE: Record<IssueSeverity, PillTone> = { now: "bad", soon: "amber", watch: "neutral" };
const UNITS: [MaintenanceUnit, string][] = [
  ["tractor", "Truck"],
  ["trailer", "Trailer"],
  ["apu", "APU"],
];

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const Seg = <T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  label: string;
}) => (
  <span
    className="inline-flex h-[32px] p-[3px] rounded-[9px] bg-well gap-[2px]"
    style={{ boxShadow: "var(--shadow-inset)" }}
    role="group"
    aria-label={label}
  >
    {options.map(([v, l]) => (
      <button
        key={v}
        type="button"
        aria-pressed={value === v}
        onClick={() => onChange(v)}
        className={`px-3 rounded-md font-condensed font-semibold text-[13.5px] ${
          value === v ? "bg-amber text-canvas" : "text-dim hover:text-ink"
        }`}
      >
        {l}
      </button>
    ))}
  </span>
);

export const IssuesPanel = ({
  issues,
  today,
  openRequested = false,
  onOpened,
  onChange,
}: {
  issues: MaintenanceIssue[];
  today: string; // 'YYYY-MM-DD'
  openRequested?: boolean; // the statusbar's "Note an issue" — consumed on open
  onOpened?: () => void;
  onChange: () => void;
}) => {
  const [showForm, setShowForm] = useState(false);
  const [what, setWhat] = useState("");
  const [noticed, setNoticed] = useState(today);
  const [unit, setUnit] = useState<MaintenanceUnit>("tractor");
  const [severity, setSeverity] = useState<IssueSeverity>("watch");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  useEffect(() => {
    if (openRequested) {
      setShowForm(true);
      onOpened?.();
    }
  }, [openRequested, onOpened]);

  const sorted = sortIssues(issues);
  const open = sorted.filter((i) => i.status === "open");
  const closed = sorted.filter((i) => i.status === "closed");

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      await createMaintenanceIssue({ what: what.trim(), noticed_on: noticed, unit, severity });
      setWhat("");
      setNoticed(today);
      setUnit("tractor");
      setSeverity("watch");
      setShowForm(false);
    });

  return (
    <div className="ds2-board p-4" data-testid="open-issues">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <p className="ds2-label">Open issues · {open.length}</p>
        <span className="font-condensed text-[12px] text-faint">noticed on the road · fixed at the next stop</span>
      </div>

      {error && <p className="text-destructive text-sm mt-2">{error}</p>}

      {showForm && (
        <div className="mt-3 grid gap-3 border border-hairline rounded-[10px] p-3 bg-well">
          <div>
            <FieldLabel htmlFor="issue-what">What you noticed</FieldLabel>
            <input
              id="issue-what"
              className="ds-input"
              value={what}
              onChange={(e) => setWhat(e.target.value)}
              placeholder="warning light on dash · air leak at the left steer · inner tandem wearing on one edge"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[auto_auto_1fr] gap-3 items-end">
            <div>
              <FieldLabel htmlFor="issue-day">Noticed on</FieldLabel>
              <input
                id="issue-day"
                type="date"
                className="ds-input"
                value={noticed}
                onChange={(e) => setNoticed(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel>Unit</FieldLabel>
              <Seg value={unit} options={UNITS} onChange={setUnit} label="Unit" />
            </div>
            <div>
              <FieldLabel>How urgent</FieldLabel>
              <Seg
                value={severity}
                options={SEVERITIES.map((s) => [s.value, s.label] as [IssueSeverity, string])}
                onChange={setSeverity}
                label="How urgent"
              />
              <p className="font-condensed text-[12px] text-faint mt-1">
                {SEVERITIES.find((s) => s.value === severity)?.word}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <PrimaryButton onClick={save} disabled={busy || !what.trim() || !noticed}>
              Note it
            </PrimaryButton>
            <GhostButton onClick={() => setShowForm(false)}>Cancel</GhostButton>
          </div>
        </div>
      )}

      {open.length === 0 ? (
        !showForm && (
          <p className="font-condensed text-[13.5px] text-faint border border-dashed border-hairline rounded-[8px] px-3 py-[10px] mt-3">
            Nothing open. A defect you notice — a warning light, an air leak, a tire wearing — goes here with the day and
            how urgent, and the service that fixes it closes it.{" "}
            <button type="button" onClick={() => setShowForm(true)} className="text-amber-hi hover:text-hot">
              Note an issue ›
            </button>
          </p>
        )
      ) : (
        <ul className="mt-3 flex flex-col">
          {open.map((i) => (
            <li
              key={i.issue_id}
              className="flex items-start gap-3 py-2.5 border-t border-hairline-lo first:border-t-0"
              data-issue={i.issue_id}
            >
              <StatusPill tone={TONE[i.severity]}>{i.severity}</StatusPill>
              <span className="min-w-0 flex-1">
                <span className="block font-condensed text-[15px] text-ink leading-tight">{i.what}</span>
                <span className="block text-[12px] text-faint mt-0.5">
                  {UNITS.find(([u]) => u === i.unit)?.[1] ?? i.unit} · noticed {fmtDate(i.noticed_on)} ·{" "}
                  {daysOpen(i, today)} day{daysOpen(i, today) === 1 ? "" : "s"} open
                </span>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(async () => void (await closeMaintenanceIssue(i.issue_id, today)))}
                className="font-condensed text-[12px] text-faint hover:text-amber-hi whitespace-nowrap"
                title="Closed by hand — it went away, or was fixed off the log. A service closes it from the log sheet."
              >
                close by hand
              </button>
              <button
                type="button"
                aria-label="Delete"
                disabled={busy}
                onClick={() => run(() => deleteMaintenanceIssue(i.issue_id))}
                className="text-faint hover:text-status-negative-text text-[14px]"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {!showForm && open.length > 0 && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="mt-2 font-condensed font-semibold text-[12.5px] text-amber-hi tracking-[.05em]"
        >
          + Note an issue
        </button>
      )}

      {closed.length > 0 && (
        <div className="mt-2 border-t border-hairline-lo pt-2">
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            className="font-condensed text-[12.5px] text-faint hover:text-dim"
          >
            {closed.length} closed {showClosed ? "·  hide" : "·  show"}
          </button>
          {showClosed && (
            <ul className="mt-1 flex flex-col">
              {closed.map((i) => (
                <li key={i.issue_id} className="flex items-center gap-3 py-1.5 text-[12.5px] text-faint">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-dim">{i.what}</span> · closed {i.closed_on ? fmtDate(i.closed_on) : "—"}
                    {i.closed_by_service_id ? " · by a service" : " · by hand"}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(async () => void (await reopenMaintenanceIssue(i.issue_id)))}
                    className="hover:text-amber-hi"
                  >
                    reopen
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
