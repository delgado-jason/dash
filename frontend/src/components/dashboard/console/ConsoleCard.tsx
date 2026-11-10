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
//
// TWO SOURCES, ONE TRUTH. A stop can be completed from this card (a stamp,
// which carries its date) or typed on the load page (a bare time, which does
// not). Both are legitimate and the card must read both — v1.272.0 shipped
// treating a stamp as the only way a stop could be done, so a shipper whose
// times were typed showed no buttons at all AND locked the receiver behind it.
import { Link } from "react-router-dom";
import { useState } from "react";
import type { Load } from "@/types/load";
import { NO_CLAIM_WORDS, stopDetentionMinutes, detentionBar } from "@/lib/detention";
import { loadStops, hm, atClock, stopProgress, type StopClock } from "@/lib/metrics/stopClock";
import { fmtTime, dwellMinutes } from "@/lib/stopTimes";
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
  /** The time-only columns — all a row typed on the load page has. */
  legacyIn: string | null | undefined;
  legacyOut: string | null | undefined;
  inAt: string | null | undefined;
  outAt: string | null | undefined;
  clock: StopClock;
  freeHours: number;
  inField: StampField;
  outField: StampField;
  load: Load;
  actions: CardActions;
  /** The receiver cannot be arrived at before the shipper is departed. */
  reachable: boolean;
}

const StopRow = ({
  label, name, city, state, apptStart, apptEnd, legacyIn, legacyOut,
  inAt, outAt, clock, freeHours, inField, outField, load, actions, reachable,
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

  // Reached and released read BOTH sources — a stamp from this card, or a time
  // typed on the load page. Which one it was changes what can be SHOWN, never
  // whether the stop happened.
  const { reached, released } = stopProgress(clock, legacyIn, legacyOut);
  // A typed time has no date, so a live clock cannot run off it. A FINISHED
  // typed stop is different: both ends are known, so the stored figures —
  // the same ones the loads table, the facility ledger and the agent
  // scorecard read — are exact and belong on the card.
  const typed = !clock.started && reached;
  const typedDwell = typed && legacyOut ? dwellMinutes(legacyIn, legacyOut, apptStart) : null;
  const typedDetention =
    typed && legacyOut ? stopDetentionMinutes(legacyIn, legacyOut, apptStart, apptEnd, freeHours) : 0;
  const typedBar = typed && legacyOut ? detentionBar(apptStart, apptEnd, legacyIn) : null;

  const detentionNow = clock.started ? clock.detentionMinutes : typedDetention;

  return (
    <div className="py-2.5">
      <p className={`font-condensed font-semibold text-[13.5px] ${reached ? "" : "text-faint"}`}>
        {label}
        {where && <span className="text-faint font-normal"> · {where}</span>}
        {appt && <span className="text-faint font-normal"> · {appt}</span>}
      </p>

      <div className="flex items-center gap-x-3.5 gap-y-1.5 flex-wrap mt-1.5">
        {!reached ? (
          <span className="font-condensed text-[13px] text-faint">not there yet</span>
        ) : (
          <>
            <span className="font-condensed text-[13.5px] text-dim tabular-nums">
              in <b className="text-ink">{clock.started ? atClock(inAt) : fmtTime(legacyIn)}</b>
              {released && (
                <> · out <b className="text-ink">{outAt ? atClock(outAt) : fmtTime(legacyOut)}</b></>
              )}
            </span>

            {/* The held time, from the later of the arrival and the
                appointment. Red once it is claimable, amber while it ticks
                inside the free window, dim when nothing can be claimed. */}
            {(clock.started || typedDwell != null) && (
              <span
                className="font-condensed font-semibold tabular-nums text-[21px] leading-none"
                style={{
                  color: detentionNow > 0
                    ? "var(--color-status-negative-text)"
                    : (clock.started ? clock.noClaim : typedBar)
                      ? "var(--color-dim)"
                      : "var(--color-amber-hi)",
                }}
              >
                {hm((clock.started ? clock.dwellMinutes : typedDwell) ?? 0)}
              </span>
            )}

            {/* Dwell and the claim are two different numbers and the card says
                both. The reason matters when there is no claim: a missing
                appointment is fixable, arriving late is not. */}
            {detentionNow > 0 ? (
              <span
                className="font-condensed font-semibold text-[12.5px]"
                style={{ color: "var(--color-status-negative-text)" }}
              >
                {hm(detentionNow)} past free — claimable
              </span>
            ) : clock.started ? (
              clock.noClaim ? (
                <span className="font-condensed text-[12.5px] text-faint">
                  held · {NO_CLAIM_WORDS[clock.noClaim]}
                </span>
              ) : (
                <span className="font-condensed text-[12.5px] text-faint">
                  free until <b className="text-dim tabular-nums">{atClock(clock.freeUntil?.toISOString())}</b>
                </span>
              )
            ) : typedDwell != null ? (
              <span className="font-condensed text-[12.5px] text-faint">
                {typedBar ? NO_CLAIM_WORDS[typedBar] : "inside free"}
              </span>
            ) : (
              // Typed, and still sitting. The stored figure needs both ends and
              // a live one needs a date, so there is no honest number yet — say
              // so rather than counting from a guessed midnight.
              <span className="font-condensed text-[12px] text-faint">
                typed on the load page — no clock until it is released
              </span>
            )}
          </>
        )}

        <span className="ml-auto flex items-center gap-2">
          {/* A stamp is a fact, so it stays undoable — a mis-tap at a dock
              should not need the load page to fix. Only a stamp THIS card made
              can be taken back; a typed time belongs to the load page. */}
          {clock.started && clock.running && (
            <button
              type="button"
              onClick={() => actions.unstamp(load, inField)}
              disabled={inBusy}
              className="font-condensed text-[11.5px] tracking-[.08em] uppercase text-faint hover:text-ink disabled:opacity-40"
            >
              Undo arrival
            </button>
          )}
          {!reached && (
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
          {reached && !released && (
            <button
              type="button"
              onClick={() => actions.stamp(load, outField)}
              disabled={outBusy}
              className="font-condensed font-bold text-[11.5px] tracking-[.1em] uppercase px-3 h-8 rounded-[9px] bg-amber text-on-amber hover:brightness-105 whitespace-nowrap disabled:opacity-40"
            >
              {outBusy ? "…" : "Departed"}
            </button>
          )}
          {released && (
            <span
              className="font-condensed font-semibold text-[10px] tracking-[.11em] uppercase px-2 py-[2px] rounded-full"
              style={{
                background: detentionNow > 0
                  ? "var(--color-status-negative-bg)"
                  : "var(--color-status-positive-bg)",
                color: detentionNow > 0
                  ? "var(--color-status-negative-text)"
                  : "var(--color-status-positive-text)",
              }}
            >
              {detentionNow > 0 ? `${hm(detentionNow)} detention` : "inside free"}
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

  // Released, from either source — see StopRow. The receiver cannot be arrived
  // at until the shipper has been left, however that was recorded.
  const shipperReleased = stopProgress(stops.shipper, load.shipper_in, load.shipper_out).released;
  const receiverReleased = stopProgress(stops.receiver, load.receiver_in, load.receiver_out).released;
  const bothDone = shipperReleased && receiverReleased;

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
    <div>
      <div className="flex items-baseline gap-2.5 flex-wrap">
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
        {/* Held to a width so it reads as a chip rather than a form field
            claiming its own row — the 44px height of `.ds-ctrl` stays, because
            that is the tap target a thumb needs and this gets tapped at a dock. */}
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

      {/* One hairline between the two stops, and none anywhere else. The card
          used to be a bordered box inside a bordered panel — two amber
          rectangles a few pixels apart, with rules above and below each
          section. Jason called it crammed and he was right: the content sat
          four insets deep before it reached a word. */}
      <div className="mt-1 divide-y ds2-cell-rule">
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
          freeHours={freeHours}
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
          freeHours={freeHours}
          inField="receiver_in"
          outField="receiver_out"
          load={load}
          actions={actions}
          // You cannot arrive at the receiver before leaving the shipper. The
          // button greys rather than hiding, so the order stays legible.
          reachable={shipperReleased}
        />
      </div>

      <div className="flex items-center gap-2.5 flex-wrap pt-2.5 mt-0.5 border-t ds2-cell-rule">
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
