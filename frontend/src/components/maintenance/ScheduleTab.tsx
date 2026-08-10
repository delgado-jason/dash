import { useState } from "react";
import type { MaintenanceItem, MaintenanceUnit } from "@/types/maintenance";
import {
  createMaintenanceItem,
  patchMaintenanceItem,
  deleteMaintenanceItem,
  seedMaintenanceItems,
  type ItemInput,
} from "@/services/maintenanceService";
import { computeDue, fleetHealth, type Due, type DueLevel } from "@/lib/metrics/maintenance";
import { MaintenanceItemForm } from "./MaintenanceItemForm";
import { GaugeDial } from "@/components/ui/GaugeDial";

interface Props {
  items: MaintenanceItem[];
  currentMiles: Record<MaintenanceUnit, number | null>;
  milesPerMonth: number | null;
  onChange: () => void;
}

const META: Record<DueLevel, { label: string; color: string }> = {
  overdue: { label: "Overdue", color: "#e05252" },
  soon: { label: "Due soon", color: "var(--color-amber-hi)" },
  ok: { label: "Running", color: "#6fd08c" },
  unknown: { label: "No baseline", color: "var(--color-faint)" },
};

// Top-level sections. Transmission is physically on the tractor but gets its
// own section; everything else on the tractor is "Truck".
const SECTIONS = ["Truck", "Transmission", "Trailer"] as const;
const sectionOf = (i: MaintenanceItem): string =>
  i.category === "transmission"
    ? "Transmission"
    : i.unit === "trailer"
      ? "Trailer"
      : "Truck";

const num = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
    timeZone: "UTC",
  });

const intervalLabel = (i: MaintenanceItem): string => {
  const p: string[] = [];
  if (i.interval_miles) p.push(`${Math.round(i.interval_miles / 1000)}k mi`);
  if (i.interval_months) p.push(`${i.interval_months} mo`);
  return p.join(" or ") || "as needed";
};

const lastDoneLabel = (i: MaintenanceItem): string => {
  const p: string[] = [];
  if (i.last_done_miles != null) p.push(`${num(i.last_done_miles)} mi`);
  if (i.last_done_date) p.push(fmtDate(i.last_done_date));
  return p.join(" · ") || "—";
};

const dueLabel = (d: Due): string => {
  const p: string[] = [];
  if (d.milesRemaining != null)
    p.push(
      d.milesRemaining < 0
        ? `${num(-d.milesRemaining)} mi over`
        : `${num(d.milesRemaining)} mi out`,
    );
  if (d.dueDate && d.daysRemaining != null)
    p.push(
      d.daysRemaining < 0
        ? `${Math.round(-d.daysRemaining)} days over`
        : `due ${fmtDate(d.dueDate)}`,
    );
  else if (d.etaDate) p.push(`~${fmtDate(d.etaDate)}`);
  return p.join(" · ") || "—";
};

// A clock at the door reads hot even before it's technically overdue —
// presentation cue only (the level still comes from computeDue).
const AT_THE_DOOR = 0.97;

const ClockCells = ({ due }: { due: Due }) => {
  const fill = Math.min(1, Math.max(0, due.progress ?? 0));
  const hot = due.level === "overdue" || fill >= AT_THE_DOOR;
  return (
    <div className="flex gap-[3px]">
      {Array.from({ length: 14 }, (_, i) => {
        const on = (i + 1) / 14 <= fill + 1e-6;
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
                  : {
                      background:
                        "linear-gradient(180deg, var(--color-hot), var(--color-amber))",
                      border: "1px solid rgba(245,176,58,.55)",
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
};

export const ScheduleTab = ({
  items,
  currentMiles,
  milesPerMonth,
  onChange,
}: Props) => {
  const [view, setView] = useState<"board" | "table">("board");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MaintenanceItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const rows = items.map((item) => ({
    item,
    due: computeDue(item, currentMiles[item.unit], now, milesPerMonth),
  }));

  const counts = { overdue: 0, soon: 0, ok: 0, unknown: 0 };
  for (const r of rows) counts[r.due.level]++;
  const health = fleetHealth(counts);

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

  const save = (data: ItemInput) =>
    run(async () => {
      if (editing) await patchMaintenanceItem(editing.item_id, data);
      else await createMaintenanceItem(data);
      setShowForm(false);
      setEditing(null);
    });

  const openEdit = (item: MaintenanceItem) => {
    setEditing(item);
    setShowForm(true);
  };

  if (items.length === 0 && !showForm) {
    return (
      <div className="ds2-board p-6 text-center mt-4">
        <p className="font-condensed text-[14px] text-dim mb-4">
          No maintenance schedule yet. Load the starter schedule for your LT625 +
          X15 (severe-duty intervals you can tune), or add clocks yourself.
        </p>
        {error && <p className="text-destructive text-sm mb-3">{error}</p>}
        <div className="flex gap-2 justify-center">
          <button
            className="h-9 px-4 rounded-[10px] font-condensed font-semibold text-[13.5px] text-canvas disabled:opacity-50"
            style={{
              background: "linear-gradient(178deg, var(--color-hot), var(--color-amber))",
            }}
            disabled={busy}
            onClick={() => run(async () => void (await seedMaintenanceItems()))}
          >
            LOAD STARTER SCHEDULE
          </button>
          <button
            className="h-9 px-4 rounded-[10px] font-condensed font-semibold text-[13.5px] text-dim bg-well border border-hairline"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            ADD CLOCK
          </button>
        </div>
      </div>
    );
  }

  const KnownRow = ({ item, due }: { item: MaintenanceItem; due: Due }) => (
    <div className="px-4 py-3 border-t ds2-cell-rule first:border-t-0">
      <div className="flex justify-between items-baseline gap-3 mb-[7px]">
        <span className="font-condensed font-semibold text-[14.5px] min-w-0 truncate">
          {item.name}
        </span>
        <span className="flex items-center gap-3 shrink-0">
          <span
            className="font-condensed font-semibold text-[13px] tabular-nums"
            style={{ color: META[due.level].color }}
          >
            {dueLabel(due)}
          </span>
          <button
            onClick={() => openEdit(item)}
            className="font-condensed font-semibold text-[11px] tracking-[.08em] text-dim hover:text-ink"
          >
            EDIT
          </button>
          <button
            aria-label="Delete"
            onClick={() => !busy && run(() => deleteMaintenanceItem(item.item_id))}
            className="font-condensed text-[13px] text-faint hover:text-[#e05252]"
          >
            ✕
          </button>
        </span>
      </div>
      <ClockCells due={due} />
      <p className="font-condensed text-[10.5px] text-faint mt-[5px]">
        every {intervalLabel(item)} · last done {lastDoneLabel(item)}
      </p>
    </div>
  );

  const sectionNote = (section: string): string | null => {
    if (section === "Trailer")
      return currentMiles.trailer != null
        ? `hub scale · ${num(currentMiles.trailer)} — hub advances when a service logs a reading`
        : "hub scale — hub advances when a service logs a reading";
    if (section === "Truck")
      return currentMiles.tractor != null
        ? `odometer scale · ${num(currentMiles.tractor)}`
        : null;
    return null;
  };

  return (
    <div>
      {/* fleet health — the same dial the Fleet tab's speedometers use */}
      <div className="ds2-board mt-4">
        <div className="flex gap-6 items-center flex-wrap px-4 py-3.5">
          <GaugeDial value={health.score ?? 0} min={0} max={100} size={128} />
          <div>
            <p className="font-condensed font-semibold text-[15px] text-dim">
              <span className="font-display text-[30px] tracking-[.04em] text-ink font-normal">
                {health.score != null ? Math.round(health.score) : "—"}
              </span>{" "}
              · fleet health
            </p>
            <div className="flex gap-2 flex-wrap mt-2">
              {counts.overdue > 0 && (
                <span className="font-condensed font-bold text-[11px] tracking-[.1em] px-[10px] py-[3px] rounded-full text-[#e05252] border border-[rgba(224,82,82,.35)] bg-[rgba(224,82,82,.08)]">
                  {counts.overdue} OVERDUE
                </span>
              )}
              {counts.soon > 0 && (
                <span className="font-condensed font-bold text-[11px] tracking-[.1em] px-[10px] py-[3px] rounded-full text-amber-hi border border-[rgba(232,148,10,.35)] bg-[rgba(232,148,10,.08)]">
                  {counts.soon} CLOSE
                </span>
              )}
              {counts.ok > 0 && (
                <span className="font-condensed font-bold text-[11px] tracking-[.1em] px-[10px] py-[3px] rounded-full text-[#6fd08c] border border-[rgba(111,208,140,.3)] bg-[rgba(111,208,140,.06)]">
                  {counts.ok} RUNNING
                </span>
              )}
              {counts.unknown > 0 && (
                <span className="font-condensed font-semibold text-[11px] tracking-[.1em] px-[10px] py-[3px] rounded-full text-faint border border-dashed border-hairline">
                  {counts.unknown} NO BASELINE
                </span>
              )}
            </div>
          </div>
          <span className="ml-auto inline-flex h-[30px] p-[3px] rounded-[9px] bg-well gap-[2px]" style={{ boxShadow: "inset 0 2px 4px rgba(0,0,0,.5)" }}>
            {(["board", "table"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 rounded-md font-condensed font-semibold text-[12.5px] capitalize ${
                  view === v ? "bg-amber text-canvas" : "text-dim hover:text-ink"
                }`}
              >
                {v}
              </button>
            ))}
          </span>
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="h-8 px-[13px] rounded-[9px] font-condensed font-semibold text-[13px] text-amber-hi bg-well border border-amber/35"
            style={{ boxShadow: "inset 0 1px 3px rgba(0,0,0,.5)" }}
          >
            + ADD CLOCK
          </button>
        </div>
      </div>

      {error && <p className="text-destructive text-sm mt-3">{error}</p>}

      {showForm && (
        <div className="mt-4">
          <MaintenanceItemForm
            initial={editing}
            onSave={save}
            onCancel={() => {
              setShowForm(false);
              setEditing(null);
            }}
            busy={busy}
          />
        </div>
      )}

      {view === "board" ? (
        SECTIONS.map((section) => {
          const group = rows.filter((r) => sectionOf(r.item) === section);
          if (group.length === 0) return null;
          const known = group
            .filter((r) => r.due.level !== "unknown")
            .sort((a, b) => (b.due.progress ?? 0) - (a.due.progress ?? 0));
          const unknown = group.filter((r) => r.due.level === "unknown");
          const note = sectionNote(section);
          return (
            <div key={section} className="ds2-board overflow-hidden mt-4">
              <div className="flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule">
                <span className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
                  {section}
                </span>
                <span className="font-condensed text-[12px] text-faint">
                  · {group.length}
                  {note ? ` · ${note}` : ""}
                </span>
              </div>
              {known.map(({ item, due }) => (
                <KnownRow key={item.item_id} item={item} due={due} />
              ))}
              {unknown.length > 0 && (
                <div className="px-4 py-[11px] border-t ds2-cell-rule font-condensed text-[12.5px] text-faint">
                  <b className="text-dim font-semibold">
                    {unknown.length} clock{unknown.length === 1 ? "" : "s"} without a
                    baseline
                  </b>{" "}
                  — dashed until their first service logs. Tap one to set a baseline
                  by hand:{" "}
                  {unknown.map(({ item }, i) => (
                    <span key={item.item_id}>
                      {i > 0 && " · "}
                      <button
                        onClick={() => openEdit(item)}
                        className="text-dim hover:text-amber-hi underline decoration-dotted underline-offset-2"
                      >
                        {item.name}
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })
      ) : (
        <div className="ds2-board p-4 overflow-x-auto mt-4">
          <table className="w-full text-sm min-w-[560px] [&_th]:pr-4 [&_td]:pr-4 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0">
            <thead>
              <tr className="font-condensed text-xs text-faint text-left uppercase tracking-[.08em]">
                <th className="font-semibold pb-2">Clock</th>
                <th className="font-semibold pb-2">System</th>
                <th className="font-semibold pb-2">Every</th>
                <th className="font-semibold pb-2">Last done</th>
                <th className="font-semibold pb-2">Next due</th>
                <th className="font-semibold pb-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .sort((a, b) => {
                  const s =
                    SECTIONS.indexOf(sectionOf(a.item) as (typeof SECTIONS)[number]) -
                    SECTIONS.indexOf(sectionOf(b.item) as (typeof SECTIONS)[number]);
                  return s !== 0 ? s : (b.due.progress ?? 0) - (a.due.progress ?? 0);
                })
                .map(({ item, due }) => (
                  <tr key={item.item_id} className="border-t border-hairline-lo">
                    <td className="py-2">{item.name}</td>
                    <td className="py-2 text-dim">{sectionOf(item)}</td>
                    <td className="py-2 text-dim">{intervalLabel(item)}</td>
                    <td className="py-2 text-dim">{lastDoneLabel(item)}</td>
                    <td className="py-2">{dueLabel(due)}</td>
                    <td
                      className="py-2 text-right font-condensed font-semibold"
                      style={{ color: META[due.level].color }}
                    >
                      {META[due.level].label}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
