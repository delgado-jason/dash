import { useState, useEffect, type ReactNode } from "react";
import type { MaintenanceItem } from "@/types/maintenance";
import {
  createMaintenanceItem,
  patchMaintenanceItem,
  deleteMaintenanceItem,
  seedMaintenanceItems,
  type ItemInput,
} from "@/services/maintenanceService";
import {
  computeDue,
  type CurrentReading,
  type Due,
  type DueLevel,
} from "@/lib/metrics/maintenance";
import type { ApuProjection } from "@/lib/metrics/apuHours";
import { MaintenanceItemForm } from "./MaintenanceItemForm";
import { MaintenanceRow, MaintenanceRowHead } from "./MaintenanceRow";
import { ForgedPlate } from "@/components/ui/ForgedPlate";
import { Board } from "@/components/ui/Board";
import { SectionHead, GhostButton } from "@/components/relationships/primitives";
import type { PillTone } from "@/components/ui/StatusPill";

interface Props {
  items: MaintenanceItem[];
  // What each unit's meter reads now: miles for the truck and trailer,
  // projected hours for the APU.
  currentReading: CurrentReading;
  milesPerMonth: number | null;
  apu: ApuProjection;
  roadDayShare: number | null;
  // Bumping it opens the add-a-clock form. "+ Add clock" lives in the
  // statusbar beside "Log service" — the plate is a readout, not a toolbar.
  addSignal?: number;
  onChange: () => void;
}

const META: Record<DueLevel, { label: string; color: string }> = {
  overdue: { label: "Overdue", color: "#e05252" },
  soon: { label: "Soon", color: "var(--color-amber-hi)" },
  ok: { label: "Running", color: "#6fd08c" },
  unknown: { label: "No baseline", color: "var(--color-faint)" },
};

// Top-level boards. Transmission is physically on the tractor but gets its own
// board; the APU is its own unit and is checked first so an APU item can never
// be pulled into Transmission by its category.
const SECTIONS = ["Truck", "Transmission", "Trailer", "APU"] as const;
type Section = (typeof SECTIONS)[number];

const sectionOf = (i: MaintenanceItem): Section =>
  i.unit === "apu"
    ? "APU"
    : i.category === "transmission"
      ? "Transmission"
      : i.unit === "trailer"
        ? "Trailer"
        : "Truck";

// The word a due-next cell uses for an item's unit.
const UNIT_WORD: Record<Section, string> = {
  Truck: "Truck",
  Transmission: "Truck",
  Trailer: "Trailer",
  APU: "APU",
};

const num = (n: number) => Math.round(n).toLocaleString("en-US");

// The right cell's number: exact under 10k, thousands above it, and a real
// minus sign when the clock has been run past.
const compact = (n: number): string => {
  const a = Math.abs(Math.round(n));
  const body = a >= 10000 ? `${Math.round(a / 1000)}k` : a.toLocaleString("en-US");
  return n < 0 ? `−${body}` : body;
};

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

// "25,000" + "mi · 6 mo" — the bold half and the plain half of the interval.
const intervalFact = (i: MaintenanceItem): { lead: string; rest: string } => {
  if (i.interval_miles)
    return {
      lead: num(i.interval_miles),
      rest: ["mi", i.interval_months ? `· ${i.interval_months} mo` : ""]
        .filter(Boolean)
        .join(" "),
    };
  if (i.interval_hours)
    return {
      lead: num(i.interval_hours),
      rest: ["hrs", i.interval_months ? `· ${i.interval_months} mo` : ""]
        .filter(Boolean)
        .join(" "),
    };
  if (i.interval_months) return { lead: String(i.interval_months), rest: "mo" };
  return { lead: "—", rest: "as needed" };
};

// The same interval as one phrase, for the folded "n more · fine" line.
const intervalWords = (i: MaintenanceItem): string => {
  const f = intervalFact(i);
  return f.rest ? `${f.lead} ${f.rest}` : f.lead;
};

// The reading under the last-done date. An APU item that was done but never
// metered says so — "hrs —" — rather than showing a zero it was never given.
const lastDoneFact = (i: MaintenanceItem): { lead: string; sub: string | null } => {
  if (!i.last_done_date)
    return { lead: "never", sub: i.unit === "apu" ? "hrs —" : "baseline" };
  const sub =
    i.unit === "apu"
      ? i.last_done_hours != null
        ? `${num(i.last_done_hours)} hrs`
        : "hrs —"
      : i.last_done_miles != null
        ? `${num(i.last_done_miles)} mi`
        : "no reading";
  return { lead: fmtDate(i.last_done_date), sub };
};

// What is LEFT — the number the row exists to show. It is the figure from the
// lens that DECIDED the level, never a friendlier one: an APU item overdue on
// months must not print 760 healthy hours in red. Hours off a projection wear
// a "~".
const leftCell = (
  item: MaintenanceItem,
  due: Due,
  estimated: boolean,
): { value: string; caption: string; color?: string } => {
  const color = META[due.level].color;
  const tilde = estimated ? "~" : "";
  if (due.decidedBy === "hours" && due.hoursRemaining != null)
    return { value: `${tilde}${compact(due.hoursRemaining)}`, caption: "hours", color };
  if (due.decidedBy === "miles" && due.milesRemaining != null)
    return { value: compact(due.milesRemaining), caption: "miles", color };
  if (due.decidedBy === "months" && due.daysRemaining != null)
    return { value: compact(due.daysRemaining), caption: "days", color };
  // No lens can count: the meter has given nothing. "—", never a fake 0.
  return { value: "—", caption: item.unit === "apu" ? "hours" : "miles" };
};

// Exactly ONE chip per row — the row's own standing, nothing else. An item the
// engine cannot count wears "No baseline" whatever its unit; for an APU item
// that means the hour meter was never written down.
const chipFor = (due: Due): { tone: PillTone; label: string } | null => {
  if (due.level === "overdue") return { tone: "bad", label: "Overdue" };
  if (due.level === "soon") return { tone: "amber", label: "Soon" };
  if (due.level === "unknown") return { tone: "neutral", label: "No baseline" };
  return null;
};

const contextOf = (i: MaintenanceItem): string =>
  `${i.category} · warn ${i.warn_lead_days} days before`;

// The due-next cell's second line: the unit, then either the interval and how
// far past, or how much is left and roughly when. Same rule as the right cell —
// the DECIDING lens talks, and nobody answers for a clock that cannot count.
const urgencyLine = (
  i: MaintenanceItem,
  due: Due,
  now: Date,
  estimated: boolean,
): string => {
  const unit = UNIT_WORD[sectionOf(i)];
  const tilde = estimated ? "~" : "";
  const eta =
    due.etaDate != null
      ? `~${Math.max(0, Math.round((new Date(due.etaDate + "T00:00:00Z").getTime() - now.getTime()) / 86_400_000))} days`
      : null;

  const meter =
    due.decidedBy === "hours" && due.hoursRemaining != null
      ? { left: due.hoursRemaining, word: "hrs", mark: tilde }
      : due.decidedBy === "miles" && due.milesRemaining != null
        ? { left: due.milesRemaining, word: "mi", mark: "" }
        : null;
  if (meter) {
    if (meter.left < 0)
      return `${unit} · every ${intervalWords(i)} · ${meter.mark}${compact(-meter.left)} ${meter.word} over`;
    return [unit, `${meter.mark}${num(meter.left)} ${meter.word} left`, eta]
      .filter(Boolean)
      .join(" · ");
  }
  if (due.decidedBy === "months" && due.daysRemaining != null && due.dueDate)
    return `${unit} · every ${intervalWords(i)} · ${
      due.daysRemaining < 0
        ? `${Math.round(-due.daysRemaining)} days over`
        : `due ${fmtDate(due.dueDate)}`
    }`;
  return `${unit} · every ${intervalWords(i)} · ${
    i.unit === "apu" ? "needs a reading" : "needs a baseline"
  }`;
};

// Urgency order: overdue, then soon, then how far each has run, then the
// clocks that cannot be counted at all.
const LEVEL_RANK: Record<DueLevel, number> = { overdue: 0, soon: 1, ok: 2, unknown: 3 };
const byUrgency = (a: { due: Due }, b: { due: Due }): number =>
  LEVEL_RANK[a.due.level] - LEVEL_RANK[b.due.level] ||
  (b.due.progress ?? 0) - (a.due.progress ?? 0);

// A clock earns a full row when it is flagged, or when it HAS been done but
// cannot be counted (an APU service with no meter reading) — those two are the
// ones with something to say. Everything else folds behind "n more · fine".
const isFine = (r: { item: MaintenanceItem; due: Due }): boolean =>
  r.due.level === "ok" || (r.due.level === "unknown" && !r.item.last_done_date);

interface Row {
  item: MaintenanceItem;
  due: Due;
  estimated: boolean; // its figures came off the APU projection
}

// The plate is the mock's FIXED strip: Overdue, Soon, Then — always those
// three, always in that order. Each cell holds the most urgent clock at its own
// level, and an empty cell says so rather than letting the next level slide up
// into its place. "Overdue · Overdue · Then" would make one bad week look like
// two.
const SLOTS = ["Overdue", "Soon", "Then"] as const;
type Slot = (typeof SLOTS)[number];

const EMPTY_SLOT: Record<Slot, string> = {
  Overdue: "nothing overdue",
  Soon: "nothing soon",
  Then: "—",
};

// `ranked` is already in urgency order, so the first match IS the most urgent.
// "Then" is everything that is neither overdue nor soon — the next clock to
// watch, including one that is waiting on a reading.
const slotRow = (ranked: Row[], slot: Slot): Row | undefined =>
  slot === "Overdue"
    ? ranked.find((r) => r.due.level === "overdue")
    : slot === "Soon"
      ? ranked.find((r) => r.due.level === "soon")
      : ranked.find((r) => r.due.level !== "overdue" && r.due.level !== "soon");

const DueNextCell = ({
  slot,
  row,
  now,
}: {
  slot: Slot;
  row: Row | undefined;
  now: Date;
}) => (
  <div className="px-[18px] py-4">
    <p className="ds2-label">{slot}</p>
    {row ? (
      <>
        <p
          className="font-condensed font-semibold text-[19px] leading-[1.15] mt-1.5 truncate"
          style={{ color: META[row.due.level].color }}
        >
          {row.item.name}
        </p>
        <p className="mt-1 text-[11.5px] text-faint truncate">
          {urgencyLine(row.item, row.due, now, row.estimated)}
        </p>
      </>
    ) : (
      <p className="font-condensed font-semibold text-[19px] leading-[1.15] mt-1.5 text-faint">
        {EMPTY_SLOT[slot]}
      </p>
    )}
  </div>
);

const Chip = ({
  children,
  tone = "dim",
}: {
  children: ReactNode;
  tone?: "job" | "dim";
}) => (
  <span
    className={`inline-flex items-center h-[22px] px-2.5 rounded-[11px] font-condensed font-semibold text-[11px] tracking-[.08em] uppercase ${
      tone === "job"
        ? "text-amber-hi border border-amber/35 bg-amber/[.08]"
        : "text-faint border border-hairline"
    }`}
  >
    {children}
  </span>
);

export const ScheduleTab = ({
  items,
  currentReading,
  milesPerMonth,
  apu,
  roadDayShare,
  addSignal = 0,
  onChange,
}: Props) => {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MaintenanceItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<Record<string, boolean>>({});

  // The statusbar's "+ Add clock" opens a blank form here.
  useEffect(() => {
    if (addSignal > 0) {
      setEditing(null);
      setShowForm(true);
    }
  }, [addSignal]);

  const now = new Date();
  const rows: Row[] = items.map((item) => ({
    item,
    due: computeDue(
      item,
      item.unit === "apu" ? null : currentReading[item.unit],
      now,
      milesPerMonth,
      {
        currentHours: item.unit === "apu" ? currentReading.apu : null,
        hoursPerRoadDay: apu.rate,
        roadDayShare,
      },
    ),
    // Only an APU row reads a projected meter, and only then when a road day
    // has passed since the reading.
    estimated: item.unit === "apu" && currentReading.apuEstimated,
  }));

  const ranked = [...rows].sort(byUrgency);
  const flagged = rows.filter(
    (r) => r.due.level === "overdue" || r.due.level === "soon",
  ).length;

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
          X15 + TriPac (severe-duty intervals you can tune), or add clocks
          yourself.
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
          <GhostButton onClick={() => { setEditing(null); setShowForm(true); }}>
            ADD CLOCK
          </GhostButton>
        </div>
      </div>
    );
  }

  const boardNote = (section: Section): string | null => {
    if (section === "Truck")
      return currentReading.tractor != null
        ? `odometer ${num(currentReading.tractor)} · from the log and the loads`
        : "odometer — · no reading yet";
    if (section === "Trailer")
      return currentReading.trailer != null
        ? `hub ${num(currentReading.trailer)}`
        : "hub — · the hub advances when a service logs a reading";
    if (section === "APU")
      return apu.hours == null
        ? "hours — · needs a reading"
        : `hours ${apu.estimated ? "~" : ""}${num(apu.hours)}${apu.estimated ? " · est." : ""}`;
    return null;
  };

  return (
    <div>
      {/* Due next — the one plate on the page */}
      <ForgedPlate className="mt-4 overflow-hidden">
        <div className="flex items-center gap-2 flex-wrap px-[18px] pt-3.5">
          <Chip tone="job">Due next</Chip>
          <Chip>{flagged} flagged</Chip>
          <Chip>
            {milesPerMonth != null
              ? `pace ${num(milesPerMonth)} mi/mo`
              : "pace — mi/mo"}
          </Chip>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x ds2-cell-rule mt-1">
          {SLOTS.map((slot) => (
            <DueNextCell key={slot} slot={slot} row={slotRow(ranked, slot)} now={now} />
          ))}
        </div>
      </ForgedPlate>

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
            onDelete={
              editing
                ? () => run(() => deleteMaintenanceItem(editing.item_id))
                : undefined
            }
            busy={busy}
          />
        </div>
      )}

      {SECTIONS.map((section) => {
        const group = rows.filter((r) => sectionOf(r.item) === section).sort(byUrgency);
        if (group.length === 0) return null;
        const fine = group.filter(isFine);
        const shown = opened[section] ? group : group.filter((r) => !isFine(r));
        const note = boardNote(section);
        return (
          <Board key={section} className="overflow-hidden mt-4">
            <SectionHead right={note}>
              {/* The APU board is lit info-blue — the one unit that reads a
                  different meter, so the eye finds it. Colour goes on this
                  span, not the head's class, so it beats the inherited faint. */}
              <span className={section === "APU" ? "text-[#7ab0e8]" : ""}>
                {section} · {group.length}
              </span>
            </SectionHead>
            {shown.length > 0 && <MaintenanceRowHead />}
            {shown.map(({ item, due, estimated }) => (
              <MaintenanceRow
                key={item.item_id}
                name={item.name}
                chip={chipFor(due)}
                context={contextOf(item)}
                interval={intervalFact(item)}
                lastDone={lastDoneFact(item)}
                left={leftCell(item, due, estimated)}
                dimmed={due.level === "ok"}
                onOpen={() => openEdit(item)}
              />
            ))}
            {fine.length > 0 && !opened[section] && (
              <button
                type="button"
                onClick={() => setOpened((p) => ({ ...p, [section]: true }))}
                className="w-full text-left px-3.5 py-[11px] border-t border-hairline-lo font-condensed text-[12.5px] text-faint hover:text-dim"
              >
                {shown.length > 0 ? (
                  <>
                    <b className="text-dim font-semibold">{fine.length} more</b> · fine
                  </>
                ) : (
                  fine
                    .map((r) => `${r.item.name} · ${intervalWords(r.item)}`)
                    .join(" · ") + " · fine"
                )}
              </button>
            )}
          </Board>
        );
      })}
    </div>
  );
};
