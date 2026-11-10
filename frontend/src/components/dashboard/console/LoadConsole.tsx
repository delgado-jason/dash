// The load console — the NOW band, with the taps on it.
//
// It owns every write the cards ask for, because they all need the same three
// things: show it immediately (she is tapping from a dock with one bar), put it
// back and say so if the server refuses, and give the money-moving tap a way
// out. The cards stay drawings.
//
// Nod Sheet "The Load Console", 2026-11-10. Decision 4 was undo rather than
// confirm: a dialog trains you to tap through it, an undo is there when you
// need it and invisible when you don't.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Load } from "@/types/load";
import { Panel } from "@/components/ui/Panel";
import { ConsoleCard, type CardActions, type StampField } from "./ConsoleCard";
import { patchLoad } from "@/services/patchLoadService";

// The clocks read in whole minutes, so a tick finer than this changes nothing
// on screen and re-renders every card for free.
const TICK_MS = 30_000;
// Long enough to glance away and look back, short enough not to read as a save
// still in flight. Completing is a deliberate three taps (open, type, confirm),
// so this is a net for the wrong LOAD or the wrong NUMBER rather than a stray
// thumb — and either one is noticed the moment the card leaves the board.
const UNDO_MS = 30_000;

// A stamp writes BOTH columns: the *_at moment the clock counts from, and the
// time-only column every existing reader already uses (detention, on-time, the
// facility ledger, the agent scorecard). One tap, two writes, nothing breaks.
const stampPatch = (field: StampField, at: Date | null) => {
  if (at == null) return { [`${field}_at`]: null, [field]: null };
  const hh = String(at.getHours()).padStart(2, "0");
  const mm = String(at.getMinutes()).padStart(2, "0");
  // Wall-clock time, matching what a person would have typed into the form.
  return { [`${field}_at`]: at.toISOString(), [field]: `${hh}:${mm}:00` };
};

// "YYYY-MM-DD" for a moment, in LOCAL terms — the delivery date is a calendar
// day at the dock, not a UTC instant. Slicing an ISO string would roll the day
// over for every evening delivery in a negative offset.
const localDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

interface Undo {
  label: string;
  revert: () => void;
}

interface Props {
  loads: Load[];
  freeHours: number;
  today: string;
  whenWord: (key: string, today: string) => string;
  /** Bump the page's refresh key so the real row replaces the overlay. */
  onChanged: () => void;
}

export const LoadConsole = ({ loads, freeHours, today, whenWord, onChanged }: Props) => {
  // The clock the cards read. It lives in state because the interval advancing
  // it IS the change — a memo keyed on a counter would be the same thing said
  // crookedly. Stamps take their own `new Date()`, so a tap is recorded at the
  // moment of the tap and never at the last tick.
  const [now, setNow] = useState(() => new Date());
  const [overlay, setOverlay] = useState<Record<string, Partial<Load>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, []);

  const armUndo = useCallback((u: Undo) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo(u);
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
  }, []);

  // One write path. Optimistic, rolled back by name on failure, and the
  // server's own sentence is what gets shown — "Validation failed — odometer_end
  // must be greater than odometer_start" beats "Something went wrong".
  const write = useCallback(
    async (load: Load, key: string, patch: Partial<Load>, after?: (ok: boolean) => void) => {
      const id = String(load.load_id);
      setBusy(`${id}:${key}`);
      setError(null);
      setOverlay((o) => ({ ...o, [id]: { ...o[id], ...patch } }));
      try {
        await patchLoad(id, patch as Parameters<typeof patchLoad>[1]);
        onChanged();
        after?.(true);
      } catch (e) {
        setOverlay((o) => {
          const next = { ...o };
          const row = { ...next[id] };
          for (const k of Object.keys(patch)) delete row[k as keyof Load];
          if (Object.keys(row).length === 0) delete next[id];
          else next[id] = row;
          return next;
        });
        setError(e instanceof Error ? e.message : "The save did not go through");
        after?.(false);
      } finally {
        setBusy(null);
      }
    },
    [onChanged],
  );

  const actions: CardActions = useMemo(
    () => ({
      busy,
      stamp: (load, field) => {
        const at = new Date();
        const patch = stampPatch(field, at) as Partial<Load>;
        // Arriving at the shipper is also the moment the load starts rolling.
        // She should not have to say it twice.
        if (field === "shipper_in" && load.load_status === "booked") {
          (patch as Record<string, unknown>).load_status = "in_transit";
        }
        void write(load, field, patch);
      },
      unstamp: (load, field) => {
        void write(load, field, stampPatch(field, null) as Partial<Load>);
      },
      status: (load, next) => {
        void write(load, "load_status", { load_status: next } as Partial<Load>);
      },
      complete: (load, odometerEnd) => {
        const before = load.load_status;
        // The load delivered when it was released, not when she got round to
        // tapping — so the date comes off the receiver's out-stamp when there
        // is one. `loads_delivered_needs_readings` wants all three together.
        const released = load.receiver_out_at ? new Date(load.receiver_out_at) : new Date();
        const patch = {
          load_status: "delivered",
          delivery_date: localDay(Number.isNaN(released.getTime()) ? new Date() : released),
          odometer_end: odometerEnd,
        } as unknown as Partial<Load>;
        void write(load, "complete", patch, (ok) => {
          if (!ok) return;
          armUndo({
            label: `Completed ${load.load_number}`,
            revert: () => {
              void write(load, "complete", {
                load_status: before,
                odometer_end: null,
              } as unknown as Partial<Load>);
              setUndo(null);
            },
          });
        });
      },
    }),
    [busy, write, armUndo],
  );

  // What belongs on the console: everything rolling, plus — when nothing is —
  // the next booked load, because that is then the truck's actual job and the
  // one thing she needs an Arrived button for. It is NOT shown alongside a
  // rolling load: the Next panel below already answers "is anything behind
  // it", and two panels naming the same load is how a board stops being read.
  const cards = useMemo(() => {
    const merged = loads.map((l) => {
      const o = overlay[String(l.load_id)];
      return o ? { ...l, ...o } : l;
    });
    const rolling = merged.filter((l) => l.load_status === "in_transit");
    if (rolling.length > 0) return rolling;
    const booked = merged
      .filter((l) => l.load_status === "booked")
      .sort((a, b) => String(a.pickup_date).localeCompare(String(b.pickup_date)));
    return booked.slice(0, 1);
  }, [loads, overlay]);

  const rollingCount = cards.filter((l) => l.load_status === "in_transit").length;

  return (
    <Panel
      className="p-4"
      style={rollingCount > 0 ? { borderColor: "var(--color-amber)" } : undefined}
    >
      <p className="ds2-label">
        Now
        <span className="ml-2 normal-case tracking-normal text-faint font-normal">
          {cards.length === 0
            ? "nothing on the road"
            : rollingCount > 0
              ? "on the road"
              : "nothing rolling — this is next up"}
        </span>
      </p>

      {error && (
        <p
          className="font-condensed text-[12.5px] mt-2"
          style={{ color: "var(--color-status-negative-text)" }}
          role="alert"
        >
          {error}
        </p>
      )}

      {undo && (
        <div className="flex items-center gap-3 mt-2.5 px-3 py-2 rounded-[9px] border border-hairline">
          <span className="font-condensed text-[13px] text-dim">{undo.label}</span>
          <button
            type="button"
            onClick={undo.revert}
            className="ml-auto font-condensed font-semibold text-[11.5px] tracking-[.1em] uppercase text-amber-hi hover:text-hot"
          >
            Undo
          </button>
        </div>
      )}

      {cards.length === 0 ? (
        <p className="font-condensed text-[13.5px] text-faint mt-2">
          No load is rolling and nothing is booked.{" "}
          <Link to="/foreman" className="text-amber-hi underline-offset-2 hover:underline">
            Find one ›
          </Link>
        </p>
      ) : (
        // One amber rectangle, not two. The cards used to be bordered boxes
        // inside this bordered panel — concentric yellow rounded rectangles a
        // few pixels apart, which read as crammed and said the same thing
        // twice. The panel carries the state now; the cards are content, and
        // on the rare day two loads roll a rule divides them.
        <div className="mt-2 divide-y divide-hairline">
          {cards.map((l) => (
            <div
              key={String(l.load_id ?? l.load_number)}
              className="py-2.5 first:pt-0 last:pb-0"
            >
              <ConsoleCard
                load={l}
                freeHours={freeHours}
                now={now}
                actions={actions}
                today={today}
                whenWord={whenWord}
              />
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
};
