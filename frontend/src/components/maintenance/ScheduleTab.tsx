import { useState, useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { MaintenanceItem } from "@/types/maintenance";
import {
  createMaintenanceItem,
  patchMaintenanceItem,
  deleteMaintenanceItem,
  seedMaintenanceItems,
  type ItemInput,
} from "@/services/maintenanceService";
import { type CurrentReading, type Due, type DueLevel } from "@/lib/metrics/maintenance";
import type { ApuProjection } from "@/lib/metrics/apuHours";
import { underWarranty, type LastVisit, type NinetyDays, type Bucket } from "@/lib/metrics/maintenanceMoney";
import type { MaintenanceIssue, MaintenanceService } from "@/types/maintenance";
import type { ComplianceItem } from "@/types/compliance";
import { IssuesPanel } from "./IssuesPanel";
import { PaperworkPanel } from "./PaperworkPanel";
import { MaintenanceItemForm } from "./MaintenanceItemForm";
import { MaintenanceRow, MaintenanceRowHead, type RowFact } from "./MaintenanceRow";
import { Panel } from "@/components/ui/Panel";
import { Board } from "@/components/ui/Board";
import { SectionHead, GhostButton } from "@/components/relationships/primitives";
import type { PillTone } from "@/components/ui/StatusPill";
import { money } from "@/lib/format";

export interface ScheduleRow {
  item: MaintenanceItem;
  due: Due;
  estimated: boolean; // its figures came off the APU projection
  assumed: boolean; // its baseline was set at in-service and no service has replaced it
}

interface Props {
  rows: ScheduleRow[]; // every clock, graded once by the page
  currentReading: CurrentReading;
  milesPerMonth: number | null;
  apu: ApuProjection;
  lastVisits: Map<string, LastVisit>; // the visit that last did each clock
  next: NinetyDays; // the next 90 days, priced from those visits
  bucket: Bucket | null; // the Maintenance account's latest typed balance
  floor: number | null; // the Plan's Maintenance floor
  inServiceDay: string | null; // the truck's in-service date — the assumed baseline
  prompt: string | null; // "read the meter — …", when the APU needs a reading
  issues: MaintenanceIssue[]; // open and closed, the panel sorts them
  compliance: ComplianceItem[]; // the Landstar paperwork's dates
  services: MaintenanceService[]; // for the quarter's count on the paperwork panel
  today: string; // 'YYYY-MM-DD'
  issueRequested?: boolean; // the statusbar's "Note an issue" — consumed by the panel
  onIssueOpened?: () => void;
  onIssuesChange: () => void;
  // The statusbar's "+ Add clock" — a request the tab consumes on open; the
  // plate is a readout, not a toolbar.
  addRequested?: boolean;
  onAddOpened?: () => void;
  onChange: () => void;
  onDone: (item: MaintenanceItem) => void; // the Done door — log the service that does it
}

const META: Record<DueLevel, { label: string; color: string }> = {
  overdue: { label: "Overdue", color: "var(--color-status-negative-text)" },
  soon: { label: "Soon", color: "var(--color-amber-hi)" },
  ok: { label: "Running", color: "var(--color-status-positive-text)" },
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
// A baseline assumed at in-service says that too.
const lastDoneFact = (i: MaintenanceItem, assumed: boolean): { lead: string; sub: string | null } => {
  if (!i.last_done_date)
    return { lead: "never", sub: i.unit === "apu" ? "hrs —" : "baseline" };
  const sub = assumed
    ? "~ assumed at in-service"
    : i.unit === "apu"
      ? i.last_done_hours != null
        ? `${num(i.last_done_hours)} hrs`
        : "hrs —"
      : i.last_done_miles != null
        ? `${num(i.last_done_miles)} mi`
        : "no reading";
  return { lead: fmtDate(i.last_done_date), sub };
};

// "$840.87" over "TA Petro · 6 clocks" — the VISIT that last did this clock.
// A visit logged without a price says so; a clock never done has no cell.
const lastTimeFact = (v: LastVisit | undefined): RowFact | null => {
  if (!v) return null;
  const who = [v.vendor, v.clocks > 1 ? `${v.clocks} clocks` : null].filter(Boolean).join(" · ");
  return v.cost == null
    ? { lead: "unpriced", sub: who || fmtDate(v.day) }
    : { lead: v.clocks > 1 ? `in ${money(v.cost)}` : money(v.cost), sub: who || fmtDate(v.day) };
};

// What is LEFT — the number the row exists to show. It is the figure from the
// lens that DECIDED the level, never a friendlier one: an APU item overdue on
// months must not print 760 healthy hours in red. Hours off a projection wear
// a "~"; so does any figure counted from an assumed baseline.
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
    return { value: `${tilde}${compact(due.milesRemaining)}`, caption: "miles", color };
  if (due.decidedBy === "months" && due.daysRemaining != null)
    return { value: `${tilde}${compact(due.daysRemaining)}`, caption: "days", color };
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

const contextOf = (i: MaintenanceItem, assumed: boolean, warrantyUntil: string | null): string =>
  `${i.category} · warn ${i.warn_lead_days} days before${assumed ? " · counting from an assumed baseline" : ""}${
    warrantyUntil ? ` · under warranty until ${fmtDate(warrantyUntil)}` : ""
  }`;

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
        ? { left: due.milesRemaining, word: "mi", mark: tilde }
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

// "last time $840.87 · TA Petro · Aug 21 · 6 clocks" under a due-next cell.
const lastTimeLine = (v: LastVisit | undefined): string | null => {
  if (!v) return null;
  const parts = [
    v.cost == null ? "last time unpriced" : `last time ${v.clocks > 1 ? "in " : ""}${money(v.cost)}`,
    v.vendor,
    fmtDate(v.day),
    v.clocks > 1 ? `${v.clocks} clocks` : null,
  ].filter(Boolean);
  return parts.join(" · ");
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
// A clock with NO baseline at all stays out of the fold now: it has a door to
// tap (the Maintenance sheet, call 3), and a door hidden behind a fold is no
// door.
const isFine = (r: ScheduleRow): boolean => r.due.level === "ok";

// The plate is the mock's FIXED strip: Overdue, Soon, Then, and — the
// Maintenance sheet's fourth cell — the next 90 days. The first three always
// hold the most urgent clock at their own level, and an empty cell says so
// rather than letting the next level slide up into its place. "Overdue ·
// Overdue · Then" would make one bad week look like two.
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
const slotRow = (ranked: ScheduleRow[], slot: Slot): ScheduleRow | undefined =>
  slot === "Overdue"
    ? ranked.find((r) => r.due.level === "overdue")
    : slot === "Soon"
      ? ranked.find((r) => r.due.level === "soon")
      : ranked.find((r) => r.due.level !== "overdue" && r.due.level !== "soon");

const DueNextCell = ({
  slot,
  row,
  now,
  last,
}: {
  slot: Slot;
  row: ScheduleRow | undefined;
  now: Date;
  last: LastVisit | undefined;
}) => (
  <div className="px-[18px] py-4">
    <p className="ds2-label">{slot}</p>
    {row ? (
      <>
        <p
          className="font-condensed font-semibold text-[20.5px] leading-[1.15] mt-1.5 truncate"
          style={{ color: META[row.due.level].color }}
        >
          {row.item.name}
        </p>
        <p className="mt-1 text-[12.5px] text-faint truncate">
          {urgencyLine(row.item, row.due, now, row.estimated || row.assumed)}
        </p>
        {lastTimeLine(last) && (
          <p className="mt-0.5 text-[12.5px] text-dim truncate">{lastTimeLine(last)}</p>
        )}
      </>
    ) : (
      <p className="font-condensed font-semibold text-[20.5px] leading-[1.15] mt-1.5 text-faint">
        {EMPTY_SLOT[slot]}
      </p>
    )}
  </div>
);

// The fourth cell: what is coming and whether the bucket covers it. The
// figure is the visits that last did these clocks, each once — a history,
// not a guess — and it says when some of them have never been priced.
const NextNinetyCell = ({ next, bucket, floor }: { next: NinetyDays; bucket: Bucket | null; floor: number | null }) => {
  const tone =
    bucket == null || next.visits.length === 0
      ? "var(--color-ink)"
      : bucket.balance >= next.total
        ? "var(--color-status-positive-text)"
        : "var(--color-status-negative-text)";
  return (
    <div className="px-[18px] py-4 bg-well" data-testid="next-90">
      <p className="ds2-label">Next {next.horizonDays} days</p>
      <p className="font-condensed font-semibold text-[20.5px] leading-[1.15] mt-1.5 text-ink truncate">
        {next.clocks === 0
          ? "nothing due"
          : next.visits.length === 0
            ? `${next.clocks} clock${next.clocks === 1 ? "" : "s"} · never priced`
            : `${next.clocks} clock${next.clocks === 1 ? "" : "s"} · ≈ ${money(next.total)}`}
      </p>
      {next.visits.length > 0 && (
        <p className="mt-1 text-[12.5px] text-faint truncate">
          last done across {next.visits.length} visit{next.visits.length === 1 ? "" : "s"}, {money(next.total)} together
          {next.unpriced > 0 ? ` · ${next.unpriced} never priced` : ""}
        </p>
      )}
      <p className="mt-0.5 text-[12.5px] text-dim truncate">
        {bucket ? (
          <>
            the Maintenance bucket holds <b style={{ color: tone }}>{money(bucket.balance)}</b> ({fmtDate(bucket.asOf)})
          </>
        ) : (
          "no Maintenance balance typed yet"
        )}
        {floor != null && <> · floor {money(floor)}</>} ·{" "}
        <Link to="/status" className="text-amber-hi hover:text-hot">
          Plan ›
        </Link>
      </p>
    </div>
  );
};

const Chip = ({
  children,
  tone = "dim",
}: {
  children: ReactNode;
  tone?: "job" | "dim" | "warn";
}) => (
  <span
    className={`inline-flex items-center h-[22px] px-2.5 rounded-[11px] font-condensed font-semibold text-[12px] tracking-[.08em] uppercase ${
      tone === "job"
        ? "text-amber-hi border border-amber/35 bg-amber/[.08]"
        : tone === "warn"
          ? "text-amber-hi border border-amber/60 normal-case tracking-normal"
          : "text-faint border border-hairline"
    }`}
  >
    {children}
  </span>
);

export const ScheduleTab = ({
  rows,
  currentReading,
  milesPerMonth,
  apu,
  lastVisits,
  next,
  bucket,
  floor,
  inServiceDay,
  prompt,
  issues,
  compliance,
  services,
  today,
  issueRequested = false,
  onIssueOpened,
  onIssuesChange,
  addRequested = false,
  onAddOpened,
  onChange,
  onDone,
}: Props) => {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MaintenanceItem | null>(null);
  // What the form opens WITH — the clock itself, or the clock with the
  // in-service date dropped into "last done" for the Set pass (call 3).
  const [formInitial, setFormInitial] = useState<MaintenanceItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<Record<string, boolean>>({});

  // The statusbar's "+ Add clock" opens a blank form here.
  useEffect(() => {
    if (addRequested) {
      setEditing(null);
      setFormInitial(null);
      setShowForm(true);
      onAddOpened?.();
    }
  }, [addRequested, onAddOpened]);

  const now = new Date();
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
      setFormInitial(null);
    });

  const openEdit = (item: MaintenanceItem) => {
    setEditing(item);
    setFormInitial(item);
    setShowForm(true);
  };

  // The Set door on a clock with no baseline: the editor opens with the
  // truck's in-service day already in "last done", the reading left for the
  // owner to type. The clock then counts from an ASSUMED baseline — marked as
  // such on the row until a real service replaces it.
  const openSet = (item: MaintenanceItem) => {
    setEditing(item);
    setFormInitial(inServiceDay ? { ...item, last_done_date: inServiceDay } : item);
    setShowForm(true);
  };

  if (rows.length === 0 && !showForm) {
    return (
      <div className="ds2-board p-6 text-center mt-4">
        <p className="font-condensed text-[15px] text-dim mb-4">
          No maintenance schedule yet. Load the starter schedule for your LT625 +
          X15 + TriPac (severe-duty intervals you can tune), or add clocks
          yourself.
        </p>
        {error && <p className="text-destructive text-sm mb-3">{error}</p>}
        <div className="flex gap-2 justify-center">
          <button
            className="h-9 px-4 rounded-[10px] font-condensed font-semibold text-[14.5px] bg-amber text-on-amber disabled:opacity-50"
            disabled={busy}
            onClick={() => run(async () => void (await seedMaintenanceItems()))}
          >
            LOAD STARTER SCHEDULE
          </button>
          <GhostButton onClick={() => { setEditing(null); setFormInitial(null); setShowForm(true); }}>
            ADD CLOCK
          </GhostButton>
        </div>
      </div>
    );
  }

  const boardNote = (section: Section): string | null => {
    if (section === "Truck")
      return currentReading.tractor != null
        ? `odometer ${num(currentReading.tractor)} · from the log, the fills and the loads`
        : "odometer — · no reading yet";
    if (section === "Trailer")
      return currentReading.trailer != null
        ? `${num(currentReading.trailer)} · the truck's odometer`
        : "— · the truck's odometer, no reading yet";
    if (section === "APU")
      return apu.hours == null
        ? "hours — · needs a reading"
        : `hours ${apu.estimated ? "~" : ""}${num(apu.hours)}${apu.estimated && apu.readOn ? ` · est. since ${fmtDate(apu.readOn)}` : ""}`;
    return null;
  };

  return (
    <div>
      {/* Due next — the one plate on the page */}
      <Panel className="mt-4 overflow-hidden">
        <div className="flex items-center gap-2 flex-wrap px-[18px] pt-3.5">
          <Chip tone="job">Due next</Chip>
          <Chip>{flagged} flagged</Chip>
          <Chip>
            {milesPerMonth != null
              ? `pace ${num(milesPerMonth)} mi/mo`
              : "pace — mi/mo"}
          </Chip>
          {prompt && <Chip tone="warn">⚠ {prompt}</Chip>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.25fr] divide-y sm:divide-y-0 lg:divide-x ds2-cell-rule mt-1">
          {SLOTS.map((slot) => {
            const row = slotRow(ranked, slot);
            return (
              <DueNextCell
                key={slot}
                slot={slot}
                row={row}
                now={now}
                last={row ? lastVisits.get(row.item.item_id) : undefined}
              />
            );
          })}
          <NextNinetyCell next={next} bucket={bucket} floor={floor} />
        </div>
      </Panel>

      {/* The paperwork the log feeds, and the defects noticed before they are
          invoices (the sheet's calls 6 and 8). */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <PaperworkPanel items={compliance} services={services} today={today} />
        <IssuesPanel issues={issues} today={today} openRequested={issueRequested} onOpened={onIssueOpened} onChange={onIssuesChange} />
      </div>

      {error && <p className="text-destructive text-sm mt-3">{error}</p>}

      {showForm && (
        <div className="mt-4">
          {formInitial && formInitial !== editing && (
            <p className="font-condensed text-[13px] text-amber-hi mb-2">
              Setting a baseline: last done is pre-filled with the truck's in-service day
              {inServiceDay ? ` (${fmtDate(inServiceDay)})` : ""} — type the reading that day, and the
              clock counts from there, marked as assumed until a service replaces it.
            </p>
          )}
          <MaintenanceItemForm
            initial={formInitial}
            onSave={save}
            onCancel={() => {
              setShowForm(false);
              setEditing(null);
              setFormInitial(null);
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
              <span className={section === "APU" ? "text-status-info-text" : ""}>
                {section} · {group.length}
              </span>
            </SectionHead>
            {shown.length > 0 && <MaintenanceRowHead />}
            {shown.map(({ item, due, estimated, assumed }) => {
              const needsBaseline = due.level === "unknown";
              return (
                <MaintenanceRow
                  key={item.item_id}
                  name={item.name}
                  chip={chipFor(due)}
                  context={contextOf(
                    item,
                    assumed,
                    underWarranty(lastVisits.get(item.item_id), today) ? (lastVisits.get(item.item_id)?.warrantyUntil ?? null) : null,
                  )}
                  interval={intervalFact(item)}
                  lastDone={lastDoneFact(item, assumed)}
                  lastTime={lastTimeFact(lastVisits.get(item.item_id))}
                  left={leftCell(item, due, estimated || assumed)}
                  dimmed={due.level === "ok"}
                  onOpen={() => openEdit(item)}
                  onDone={needsBaseline ? () => openSet(item) : () => onDone(item)}
                  doneWord={needsBaseline ? "Set" : "Done"}
                />
              );
            })}
            {fine.length > 0 && !opened[section] && (
              <button
                type="button"
                onClick={() => setOpened((p) => ({ ...p, [section]: true }))}
                className="w-full text-left px-3.5 py-[11px] border-t border-hairline-lo font-condensed text-[13.5px] text-faint hover:text-dim"
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
