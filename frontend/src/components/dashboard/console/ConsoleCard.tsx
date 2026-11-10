// One live load, as a card she can work from.
//
// The NOW band used to say the load number, the lane and the delivery day, and
// everything else meant opening Loads → the load → Edit → scroll → save. That
// friction is why only 28 of 139 loads carried a shipper in-time: the field was
// never hard to understand, it was four clicks away from where she was looking.
// (Nod Sheet "The Load Console", 2026-11-10.)
//
// So the card carries the taps: arrive and depart at both stops, the status,
// and the completion. The clocks are arithmetic on stored stamps, so nothing
// here depends on the page staying open.
import { Link } from "react-router-dom";
import { useState } from "react";
import type { Load } from "@/types/load";
import { NO_CLAIM_WORDS } from "@/lib/detention";
import { loadStops, hm, atClock, type StopClock } from "@/lib/metrics/stopClock";
import { fmtTime } from "@/lib/stopTimes";
import { SelectControl } from "@/components/ui/FormControls";

// Everything the card can ask the console to write. The console owns the
// writing — optimistic overlay, rollback, undo — so the card stays a drawing.
export interface CardActions {
  stamp: (load: Load, field: StampField) => void;
  unstamp: (load: Load, field: StampField) => void;
  status: (load: Load, next: string) => void;
  complete: (load: Load, odometerEnd: number) => void;
  busy: string | null; // "<load_id>:<field>" currently in flight
}

export type StampField = "shipper_in" | "shipper_out" | "receiver_in" | "receiver_out";

// The statuses she can set from the board. `delivered` is deliberately absent:
// `loads_delivered_needs_readings` will not take it without an end odometer, so
// it goes through the completion, which asks for one. Offering it here would
// buy a 400 and teach her the board lies.
const BOARD_STATUSES = ["booked", "in_transit", "cancelled", "tonu"] as const;
const STATUS_WORDS: Record<string, string> = {
  booked: "booked",
  in_transit: "in transit",
  cancelled: "cancelled",
  tonu: "TONU",
  delivered: "delivered",
};

const num = (v: number | null | undefined): string | null =>
  v == null ? null : v.toLocaleString("en-US");

// The furthest one load can plausibly run. Jason's longest is well under half
// this, so the ceiling only ever catches a slip — it is not a rule about how
// far he may drive. Generous on purpose: a guard that argues with real work
// gets worked around.
const MAX_LOAD_MILES = 5000;

// ---- one stop ----

interface StopProps {
  label: "Shipper" | "Receiver";
  name: string | null | undefined;
  city: string | null | undefined;
  state: string | null | undefined;
  apptStart: string | null | undefined;
  apptEnd: string | null | undefined;
  /** The time-only column — all a pre-106 row has. */
  legacyIn: string | null | undefined;
  legacyOut: string | null | undefined;
  inAt: string | null | undefined;
  outAt: string | null | undefined;
  clock: StopClock;
  inField: StampField;
  outField: StampField;
  load: Load;
  actions: CardActions;
  /** The receiver cannot be arrived at before the shipper is departed. */
  reachable: boolean;
}

const StopRow = ({
  label, name, city, state, apptStart, apptEnd,
  legacyIn, legacyOut, inAt, outAt, clock, inField, outField, load, actions, reachable,
}: StopProps) => {
  const where = [name, [city, state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const appt =
    apptStart && apptEnd
      ? `window ${fmtTime(apptStart)}–${fmtTime(apptEnd)}`
      : apptStart
        ? `appt ${fmtTime(apptStart)}`
        : null;

  const inBusy = actions.busy === `${load.load_id}:${inField}`;
  const outBusy = actions.busy === `${load.load_id}:${outField}`;
  const done = clock.started && !clock.running;

  // A row written before migration 106: a time of day and no date. The clock
  // refuses rather than counting from a guessed midnight.
  const legacyOnly = !inAt && !!legacyIn;

  return (
    <div className="py-[11px] border-b ds2-cell-rule last:border-b-0">
      <p className={`font-condensed font-semibold text-[13.5px] ${clock.started ? "" : "text-faint"}`}>
        {label}
        {where && <span className="text-faint font-normal"> · {where}</span>}
        {appt && <span className="text-faint font-normal"> · {appt}</span>}
      </p>

      <div className="flex items-center gap-x-3.5 gap-y-1.5 flex-wrap mt-1.5">
        {legacyOnly ? (
          <>
            <span className="font-condensed text-[13.5px] text-dim tabular-nums">
              in <b className="text-ink">{fmtTime(legacyIn)}</b>
              {legacyOut && <> · out <b className="text-ink">{fmtTime(legacyOut)}</b></>}
            </span>
            <span className="font-condensed text-[12px] text-faint">
              logged before stamps — no date on this time, so no clock
            </span>
          </>
        ) : !clock.started ? (
          <span className="font-condensed text-[13px] text-faint">not there yet</span>
        ) : (
          <>
            <span className="font-condensed text-[13.5px] text-dim tabular-nums">
              in <b className="text-ink">{atClock(inAt)}</b>
              {outAt && <> · out <b className="text-ink">{atClock(outAt)}</b></>}
            </span>

            {/* The held time. Jason's rule: it runs from the LATER of the
                arrival and the appointment, so an early arrival is not charged
                to the dock. Red once it is claimable, amber while it ticks
                inside the free window, dim when nothing can be claimed. */}
            <span
              className="font-condensed font-semibold tabular-nums text-[21px] leading-none"
              style={{
                color: clock.detentionMinutes > 0
                  ? "var(--color-status-negative-text)"
                  : clock.noClaim
                    ? "var(--color-dim)"
                    : "var(--color-amber-hi)",
              }}
            >
              {hm(clock.dwellMinutes ?? 0)}
            </span>

            {/* Dwell and the claim are two different numbers and the card says
                both. The reason matters when there is no claim: a missing
                appointment is fixable, arriving late is not. */}
            {clock.noClaim ? (
              <span className="font-condensed text-[12.5px] text-faint">
                held · {NO_CLAIM_WORDS[clock.noClaim]}
              </span>
            ) : clock.detentionMinutes > 0 ? (
              <span
                className="font-condensed font-semibold text-[12.5px]"
                style={{ color: "var(--color-status-negative-text)" }}
              >
                {hm(clock.detentionMinutes)} past free — claimable
              </span>
            ) : (
              <span className="font-condensed text-[12.5px] text-faint">
                free until <b className="text-dim tabular-nums">{atClock(clock.freeUntil?.toISOString())}</b>
              </span>
            )}
          </>
        )}

        <span className="ml-auto flex items-center gap-2">
          {/* A stamp is a fact, so it stays undoable — a mis-tap on a phone at
              a dock should not need the load page to fix. */}
          {clock.started && clock.running && !legacyOnly && (
            <button
              type="button"
              onClick={() => actions.unstamp(load, inField)}
              disabled={inBusy}
              className="font-condensed text-[11.5px] tracking-[.08em] uppercase text-faint hover:text-ink disabled:opacity-40"
            >
              Undo arrival
            </button>
          )}
          {!clock.started && !legacyOnly && (
            <button
              type="button"
              onClick={() => actions.stamp(load, inField)}
              disabled={inBusy || !reachable}
              className={`font-condensed font-bold text-[11.5px] tracking-[.1em] uppercase px-3 h-8 rounded-[9px] whitespace-nowrap disabled:opacity-40 ${
                reachable
                  ? "bg-amber text-on-amber hover:brightness-105"
                  : "border border-hairline text-faint"
              }`}
            >
              {inBusy ? "…" : "Arrived"}
            </button>
          )}
          {clock.started && clock.running && (
            <button
              type="button"
              onClick={() => actions.stamp(load, outField)}
              disabled={outBusy}
              className="font-condensed font-bold text-[11.5px] tracking-[.1em] uppercase px-3 h-8 rounded-[9px] bg-amber text-on-amber hover:brightness-105 whitespace-nowrap disabled:opacity-40"
            >
              {outBusy ? "…" : "Departed"}
            </button>
          )}
          {done && (
            <span
              className="font-condensed font-semibold text-[10px] tracking-[.11em] uppercase px-2 py-[2px] rounded-full"
              style={{
                background: clock.detentionMinutes > 0
                  ? "var(--color-status-negative-bg)"
                  : "var(--color-status-positive-bg)",
                color: clock.detentionMinutes > 0
                  ? "var(--color-status-negative-text)"
                  : "var(--color-status-positive-text)",
              }}
            >
              {clock.detentionMinutes > 0 ? `${hm(clock.detentionMinutes)} detention` : "inside free"}
            </span>
          )}
        </span>
      </div>
    </div>
  );
};

// ---- the card ----

interface Props {
  load: Load;
  freeHours: number;
  now: Date;
  actions: CardActions;
  /** The day the card is read on, for "delivers today/tomorrow". */
  today: string;
  whenWord: (key: string, today: string) => string;
}

export const ConsoleCard = ({ load, freeHours, now, actions, today, whenWord }: Props) => {
  const stops = loadStops(load, freeHours, now);
  const [finishing, setFinishing] = useState(false);
  const [odo, setOdo] = useState("");

  const rolling = load.load_status === "in_transit";
  const bothDone =
    stops.shipper.started && !stops.shipper.running &&
    stops.receiver.started && !stops.receiver.running;

  const start = load.odometer_start ?? null;
  const end = Number(odo.replace(/[^0-9]/g, ""));
  const miles = start != null && Number.isFinite(end) && end > start ? end - start : null;
  // A typo'd extra digit passes `end > start` and the DB's own check, then
  // poisons everything downstream: the carry hands it to the next load, and
  // deadhead and MPG are odometer deltas. One load cannot run this far, so a
  // reading this big is a slip, not a trip. (Seen live during verification:
  // a mis-keyed field read 604,000,606,217 and the button stayed enabled.)
  const tooFar = miles != null && miles > MAX_LOAD_MILES;
  const completing = actions.busy === `${load.load_id}:complete`;

  // The database will not take a delivered load without a start reading
  // either, and the console cannot invent one.
  const noStart = start == null;

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        borderColor: rolling ? "var(--color-amber)" : "var(--color-hairline)",
        background: "var(--t-panel)",
      }}
    >
      <div className="flex items-baseline gap-2.5 flex-wrap px-3.5 py-2.5 border-b border-hairline">
        <Link
          to={`/loads/${load.load_id}`}
          className="font-condensed font-bold text-[16px] hover:text-amber-hi"
        >
          {load.load_number}
        </Link>
        <span className="font-condensed text-[14px] text-dim">
          {load.origin_city}, {load.origin_state} → {load.destination_city}, {load.destination_state}
        </span>
        {load.delivery_date && (
          <span className="font-condensed text-[12.5px] text-faint">
            delivers {whenWord(String(load.delivery_date).slice(0, 10), today)}
          </span>
        )}
        {/* Held to a width so it reads as a chip on the card rather than a
            form field claiming its own row — the 44px height of `.ds-ctrl`
            stays, because that is the tap target a thumb needs on a phone and
            this control is meant to be tapped at a dock. */}
        <span className="ml-auto w-[124px] shrink-0">
          <SelectControl
            value={load.load_status}
            aria-label={`Status of load ${load.load_number}`}
            disabled={actions.busy === `${load.load_id}:load_status`}
            onChange={(e) => actions.status(load, e.target.value)}
            className="font-condensed text-[13px] w-full bg-transparent px-2.5"
          >
            {BOARD_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_WORDS[s]}</option>
            ))}
            {/* A delivered load can sit on the board until the page refreshes;
                its own status has to be selectable or the control reads blank. */}
            {!BOARD_STATUSES.includes(load.load_status as (typeof BOARD_STATUSES)[number]) && (
              <option value={load.load_status}>{STATUS_WORDS[load.load_status] ?? load.load_status}</option>
            )}
          </SelectControl>
        </span>
      </div>

      <div className="px-3.5">
        <StopRow
          label="Shipper"
          name={load.shipper_name}
          city={load.origin_city}
          state={load.origin_state}
          apptStart={load.pickup_appt_start}
          apptEnd={load.pickup_appt_end}
          legacyIn={load.shipper_in}
          legacyOut={load.shipper_out}
          inAt={load.shipper_in_at}
          outAt={load.shipper_out_at}
          clock={stops.shipper}
          inField="shipper_in"
          outField="shipper_out"
          load={load}
          actions={actions}
          reachable
        />
        <StopRow
          label="Receiver"
          name={load.receiver_name}
          city={load.destination_city}
          state={load.destination_state}
          apptStart={load.delivery_appt_start}
          apptEnd={load.delivery_appt_end}
          legacyIn={load.receiver_in}
          legacyOut={load.receiver_out}
          inAt={load.receiver_in_at}
          outAt={load.receiver_out_at}
          clock={stops.receiver}
          inField="receiver_in"
          outField="receiver_out"
          load={load}
          actions={actions}
          // You cannot arrive at the receiver before leaving the shipper. The
          // button greys rather than hiding, so the order is legible.
          reachable={stops.shipper.started && !stops.shipper.running}
        />
      </div>

      <div className="flex items-center gap-2.5 flex-wrap px-3.5 py-2.5 border-t border-hairline">
        {start != null ? (
          <span className="font-condensed text-[13px] text-dim">
            started <b className="text-ink tabular-nums">{num(start)}</b>
          </span>
        ) : (
          <span className="font-condensed text-[12.5px] text-faint">
            no start odometer on this load — it is needed to deliver
          </span>
        )}

        {!finishing ? (
          <span className="ml-auto">
            <button
              type="button"
              onClick={() => setFinishing(true)}
              disabled={noStart}
              title={noStart ? "This load has no start odometer yet" : undefined}
              className={`font-condensed font-bold text-[11.5px] tracking-[.1em] uppercase px-3 h-8 rounded-[9px] whitespace-nowrap disabled:opacity-40 ${
                bothDone
                  ? "bg-amber text-on-amber hover:brightness-105"
                  : "border border-hairline text-dim hover:text-ink"
              }`}
            >
              Mark delivered
            </button>
          </span>
        ) : (
          <>
            <span className="font-condensed text-[13px] text-dim flex items-center gap-2">
              end odometer
              <input
                autoFocus
                inputMode="numeric"
                value={odo}
                onChange={(e) => setOdo(e.target.value)}
                className="ds-input font-condensed tabular-nums text-[14px] w-[104px] px-2 py-1"
                style={{ borderColor: "var(--color-amber)" }}
                aria-label="End odometer"
              />
              {/* The distance is the sanity check: a fat-fingered digit shows
                  up immediately as a wrong mileage, before it is saved. */}
              {tooFar ? (
                <span className="text-[12.5px]" style={{ color: "var(--color-status-negative-text)" }}>
                  {num(miles)} mi from {num(start)} — check that reading
                </span>
              ) : miles != null ? (
                <span className="text-faint text-[12.5px] tabular-nums">
                  {num(miles)} mi from {num(start)}
                </span>
              ) : odo.trim() !== "" ? (
                <span className="text-[12.5px]" style={{ color: "var(--color-status-negative-text)" }}>
                  must be greater than {num(start)}
                </span>
              ) : null}
            </span>
            <span className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setFinishing(false); setOdo(""); }}
                className="font-condensed text-[11.5px] tracking-[.08em] uppercase text-faint hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => actions.complete(load, end)}
                disabled={miles == null || tooFar || completing}
                className="font-condensed font-bold text-[11.5px] tracking-[.1em] uppercase px-3 h-8 rounded-[9px] bg-amber text-on-amber hover:brightness-105 whitespace-nowrap disabled:opacity-40"
              >
                {completing ? "…" : "Complete load"}
              </button>
            </span>
          </>
        )}
      </div>
    </div>
  );
};
