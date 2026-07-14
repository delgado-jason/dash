import { useState } from "react";
import { Pencil, Trash2, Plus, LayoutList, Table as TableIcon } from "lucide-react";
import type { MaintenanceItem, MaintenanceUnit } from "@/types/maintenance";
import {
  createMaintenanceItem,
  patchMaintenanceItem,
  deleteMaintenanceItem,
  seedMaintenanceItems,
  type ItemInput,
} from "@/services/maintenanceService";
import { computeDue, type Due, type DueLevel } from "@/lib/metrics/maintenance";
import { MaintenanceItemForm } from "./MaintenanceItemForm";
import { HealthGauge } from "./HealthGauge";
import { Stamp } from "@/components/Stamp";
import { Panel } from "@/components/ui/Panel";

interface Props {
  items: MaintenanceItem[];
  currentMiles: Record<MaintenanceUnit, number | null>;
  milesPerMonth: number | null;
  onChange: () => void;
}

const META: Record<DueLevel, { label: string; color: string }> = {
  overdue: { label: "Overdue", color: "#e24b4a" },
  soon: { label: "Due soon", color: "#e8940a" },
  ok: { label: "OK", color: "#1d9e75" },
  unknown: { label: "No baseline yet", color: "#9daabb" },
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
  return p.join(" / ") || "as needed";
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
        : `${num(d.milesRemaining)} mi left`,
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

  if (items.length === 0 && !showForm) {
    return (
      <Panel className="p-6 text-center">
        <p className="text-muted-text mb-4">
          No maintenance schedule yet. Load the starter schedule for your LT625 +
          X15 (severe-duty intervals you can tune), or add items yourself.
        </p>
        {error && <p className="text-destructive text-sm mb-3">{error}</p>}
        <div className="flex gap-2 justify-center">
          <button
            className="bg-amber text-steel px-3 py-1.5 rounded text-sm font-semibold disabled:opacity-50"
            disabled={busy}
            onClick={() => run(async () => void (await seedMaintenanceItems()))}
          >
            Load starter schedule
          </button>
          <button
            className="bg-steel text-light px-3 py-1.5 rounded text-sm"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            Add item
          </button>
        </div>
      </Panel>
    );
  }

  const ItemRow = ({ item, due }: { item: MaintenanceItem; due: Due }) => (
    <div className="flex items-center gap-3 py-2 border-t border-steel">
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">
          {item.name}{" "}
          <span className="text-xs text-muted-text">· {item.unit}</span>
        </p>
        <div className="h-1.5 bg-steel rounded mt-1.5 overflow-hidden">
          <div
            className="h-1.5 rounded"
            style={{
              width: `${Math.min(1, due.progress ?? 0) * 100}%`,
              background: META[due.level].color,
            }}
          />
        </div>
      </div>
      <div className="text-right w-40 shrink-0">
        {due.level === "overdue" && (
          <div className="mb-1">
            <Stamp label="Overdue" color="#e24b4a" size="sm" />
          </div>
        )}
        <p className="text-xs" style={{ color: META[due.level].color }}>
          {dueLabel(due)}
        </p>
        <p className="text-[11px] text-muted-text">every {intervalLabel(item)}</p>
      </div>
      <div className="flex gap-2 text-muted-text shrink-0">
        <Pencil
          size={15}
          className="cursor-pointer hover:text-light"
          aria-label="Edit"
          onClick={() => {
            setEditing(item);
            setShowForm(true);
          }}
        />
        <Trash2
          size={15}
          className="cursor-pointer hover:text-destructive"
          aria-label="Delete"
          onClick={() =>
            !busy && run(() => deleteMaintenanceItem(item.item_id))
          }
        />
      </div>
    </div>
  );

  return (
    <div>
      <HealthGauge counts={counts} />
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <div className="ml-auto flex gap-2">
          <button
            className="bg-steel text-light px-2 py-1 rounded text-xs flex items-center gap-1"
            onClick={() => setView(view === "board" ? "table" : "board")}
          >
            {view === "board" ? (
              <>
                <TableIcon size={14} /> Table
              </>
            ) : (
              <>
                <LayoutList size={14} /> Board
              </>
            )}
          </button>
          <button
            className="bg-amber text-steel px-2 py-1 rounded text-xs font-semibold flex items-center gap-1"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            <Plus size={14} /> Add item
          </button>
        </div>
      </div>

      {error && <p className="text-destructive text-sm mb-3">{error}</p>}

      {showForm && (
        <MaintenanceItemForm
          initial={editing}
          onSave={save}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
          busy={busy}
        />
      )}

      {view === "board" ? (
        SECTIONS.map((section) => {
          const group = rows.filter((r) => sectionOf(r.item) === section);
          if (group.length === 0) return null;
          group.sort((a, b) => (b.due.progress ?? 0) - (a.due.progress ?? 0));
          return (
            <Panel key={section} className="p-4 mb-4">
              <p className="text-sm font-medium mb-1">
                {section}{" "}
                <span className="text-xs text-muted-text">· {group.length}</span>
              </p>
              {group.map(({ item, due }) => (
                <ItemRow key={item.item_id} item={item} due={due} />
              ))}
            </Panel>
          );
        })
      ) : (
        <Panel className="p-4 overflow-x-auto">
          <table className="w-full text-sm min-w-[560px] [&_th]:pr-4 [&_td]:pr-4 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0">
            <thead>
              <tr className="text-xs text-muted-text text-left">
                <th className="font-normal pb-2">Item</th>
                <th className="font-normal pb-2">System</th>
                <th className="font-normal pb-2">Every</th>
                <th className="font-normal pb-2">Last done</th>
                <th className="font-normal pb-2">Next due</th>
                <th className="font-normal pb-2 text-right">Status</th>
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
                  <tr key={item.item_id} className="border-t border-steel">
                    <td className="py-2">{item.name}</td>
                    <td className="py-2 text-muted-text">{sectionOf(item)}</td>
                    <td className="py-2 text-muted-text">{intervalLabel(item)}</td>
                    <td className="py-2 text-muted-text">{lastDoneLabel(item)}</td>
                    <td className="py-2">{dueLabel(due)}</td>
                    <td className="py-2 text-right" style={{ color: META[due.level].color }}>
                      {META[due.level].label}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
};
