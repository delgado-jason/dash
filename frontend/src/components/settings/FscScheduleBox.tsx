import { useCallback, useEffect, useMemo, useState } from "react";
import type { FscBand, FscSchedule } from "@/types/fscSchedule";
import type { FscScalePoint } from "@/types/fscScalePoint";
import {
  getFscScalePoints,
  createFscScalePoint,
  deleteFscScalePoint,
} from "@/services/fscScalePointService";
import {
  fitScale,
  fitWords,
  parseScalePaste,
  pointForDay,
  pointWords,
  scalePasteErrors,
  shortDay,
} from "@/lib/metrics/fscScale";
import type { FscScaleFit } from "@/lib/metrics/fscScale";
import {
  getFscSchedules,
  createFscSchedule,
  deleteFscSchedule,
} from "@/services/fscScheduleService";
import { getNationalDiesel } from "@/services/fuelService";
import {
  bandFor,
  bandErrors,
  bandWords,
  centsWords,
  parseFscPaste,
  scheduleInForce,
  sortBands,
  sortSchedules,
} from "@/lib/metrics/fscTable";
import { useLocalTodayKey } from "@/hooks/useLocalToday";
import { FetchFailed } from "@/components/integrity/FetchFailed";

// "Oct 1, 2026" from a day key.
const dayWords = (key: string): string =>
  new Date(`${key.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

// "Nov 9" — the day it was pasted, in the operator's own calendar.
const pastedWords = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

// The server's refusal sentences — a list under `details`, else the one error.
const refusals = (e: unknown, fallback: string): string[] => {
  const data = (
    e as {
      response?: {
        data?: { details?: unknown; error?: string; message?: string };
      };
    }
  )?.response?.data;
  if (Array.isArray(data?.details) && data.details.length > 0)
    return data.details.map(String);
  const one =
    data?.error || data?.message || (e as { message?: string })?.message;
  return [one ? String(one) : fallback];
};

const field = "bg-steel rounded px-2 py-1.5 text-light text-sm";

interface EditorProps {
  onDone: () => void;
  onCancel: () => void;
}

const Editor = ({ onDone, onCancel }: EditorProps) => {
  const [text, setText] = useState("");
  const [from, setFrom] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);

  const parsed = useMemo(() => parseFscPaste(text), [text]);
  const problems = useMemo(
    () => (parsed.bands.length > 0 ? bandErrors(parsed.bands) : []),
    [parsed],
  );

  const save = async () => {
    setBusy(true);
    setErrs([]);
    try {
      await createFscSchedule({
        effective_from: from,
        bands: parsed.bands,
        note: note.trim() || null,
      });
      onDone();
    } catch (e) {
      setErrs(refusals(e, "The table wasn't saved — try again."));
      setBusy(false);
    }
  };

  return (
    <div className="rounded px-3 py-3" style={{ background: "var(--color-well)" }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder="paste Landstar's table — one band per line: low   high   ¢ per mile; the last line may say 'and up'"
        className={field + " w-full font-mono text-[12px]"}
        aria-label="Landstar's band table"
      />
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className={field}
          aria-label="Effective date"
        />
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="where it came from — Landstar BCO FSC schedule, Oct 2026"
          className={field + " flex-1 min-w-[220px]"}
          aria-label="Note"
        />
      </div>

      {parsed.bands.length > 0 && (
        <p className="font-condensed text-[12px] text-muted-text mt-3">
          dash read {parsed.bands.length} bands:{" "}
          {parsed.bands
            .map((b) => `${bandWords(b)} → ${centsWords(b.cpm)}`)
            .join(" · ")}
        </p>
      )}
      {parsed.rejected.length > 0 && (
        <p className="font-condensed text-[12px] text-amber-hi mt-2">
          couldn't read: {parsed.rejected.join(" · ")}
        </p>
      )}
      {problems.map((s, i) => (
        <p key={i} className="font-condensed text-[12px] text-amber-hi mt-1">
          {s}
        </p>
      ))}

      <div className="flex items-center gap-3 mt-3">
        <button
          type="button"
          onClick={save}
          disabled={
            busy || problems.length > 0 || parsed.bands.length < 2 || !from
          }
          className="bg-amber text-steel px-3 py-1.5 rounded text-sm font-semibold disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="text-sm text-muted-text hover:text-light"
        >
          Cancel
        </button>
      </div>
      {errs.map((s, i) => (
        <p key={i} className="font-condensed text-[12px] text-amber-hi mt-2">
          {s}
        </p>
      ))}
    </div>
  );
};

const RemoveAsk = ({
  schedule,
  busy,
  onYes,
  onNo,
}: {
  schedule: FscSchedule;
  busy: boolean;
  onYes: () => void;
  onNo: () => void;
}) => (
  <p className="font-condensed text-[13px] text-light mt-2">
    Remove the table effective {dayWords(schedule.effective_from)}? Months it
    priced fall back to the estimate.{" "}
    <button
      type="button"
      onClick={onYes}
      disabled={busy}
      className="font-semibold text-amber-hi hover:text-hot"
    >
      Yes
    </button>{" "}
    ·{" "}
    <button
      type="button"
      onClick={onNo}
      disabled={busy}
      className="font-semibold text-muted-text hover:text-light"
    >
      No
    </button>
  </p>
);

// ---- Landstar's weekly scale: one line a week from the Ranger report ----

const PointEditor = ({ onDone, onCancel }: EditorProps) => {
  const [text, setText] = useState("");
  const [weekOverride, setWeekOverride] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);

  const parsed = useMemo(() => parseScalePaste(text), [text]);
  const weekOf = weekOverride ?? parsed.week_of ?? "";
  const problems = useMemo(
    () =>
      text.trim()
        ? scalePasteErrors({ ...parsed, week_of: weekOf || null })
        : [],
    [text, parsed, weekOf],
  );
  const preview =
    parsed.national_avg != null && parsed.cents_per_mile != null
      ? pointWords({
          point_id: "",
          week_of: weekOf,
          national_avg: parsed.national_avg,
          cents_per_mile: parsed.cents_per_mile,
          pct_of_linehaul: parsed.pct_of_linehaul,
          regions: parsed.regions,
          note: null,
        })
      : null;

  const save = async () => {
    if (parsed.national_avg == null || parsed.cents_per_mile == null) return;
    setBusy(true);
    setErrs([]);
    try {
      await createFscScalePoint({
        week_of: weekOf,
        national_avg: parsed.national_avg,
        cents_per_mile: parsed.cents_per_mile,
        pct_of_linehaul: parsed.pct_of_linehaul,
        regions: parsed.regions,
        note: note.trim() || null,
      });
      onDone();
    } catch (e) {
      setErrs(refusals(e, "The week wasn't saved — try again."));
      setBusy(false);
    }
  };

  return (
    <div className="rounded px-3 py-3" style={{ background: "var(--color-well)" }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder="paste the report's header — the 'effective' line, the National Average line, the % line and the PADD lines — or just: National Average $6.292 .86"
        className={field + " w-full font-mono text-[12px]"}
        aria-label="Landstar's weekly scale line"
      />
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <label className="flex items-center gap-2 text-xs text-muted-text">
          week of
          <input
            type="date"
            value={weekOf}
            onChange={(e) => setWeekOverride(e.target.value)}
            className={field}
            aria-label="Week of"
          />
        </label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ranger fuel surcharge report effective 11/03/26 through 11/09/26"
          className={field + " flex-1 min-w-[220px]"}
          aria-label="Note"
        />
      </div>

      {preview && (
        <p className="font-condensed text-[12px] text-muted-text mt-3">
          dash read: {weekOf ? `week of ${shortDay(weekOf)} · ` : ""}
          {preview}
        </p>
      )}
      {parsed.rejected.length > 0 && (
        <p className="font-condensed text-[12px] text-amber-hi mt-2">
          couldn't read: {parsed.rejected.join(" · ")}
        </p>
      )}
      {problems.map((s, i) => (
        <p key={i} className="font-condensed text-[12px] text-amber-hi mt-1">
          {s}
        </p>
      ))}

      <div className="flex items-center gap-3 mt-3">
        <button
          type="button"
          onClick={save}
          disabled={busy || !text.trim() || problems.length > 0}
          className="bg-amber text-steel px-3 py-1.5 rounded text-sm font-semibold disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="text-sm text-muted-text hover:text-light"
        >
          Cancel
        </button>
      </div>
      {errs.map((s, i) => (
        <p key={i} className="font-condensed text-[12px] text-amber-hi mt-2">
          {s}
        </p>
      ))}
    </div>
  );
};

interface ScaleSectionProps {
  points: FscScalePoint[] | null;
  failed: boolean;
  fit: FscScaleFit | null;
  todayKey: string;
  onReload: () => void;
}

const ScaleSection = ({
  points,
  failed,
  fit,
  todayKey,
  onReload,
}: ScaleSectionProps) => {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removeErrs, setRemoveErrs] = useState<string[]>([]);

  const current = useMemo(
    () => (points ? pointForDay(points, todayKey) : null),
    [points, todayKey],
  );
  const ordered = useMemo(
    () =>
      points
        ? [...points].sort((a, b) =>
            a.week_of < b.week_of ? 1 : a.week_of > b.week_of ? -1 : 0,
          )
        : [],
    [points],
  );

  const remove = async (p: FscScalePoint) => {
    setBusy(true);
    setRemoveErrs([]);
    try {
      await deleteFscScalePoint(p.point_id);
      setRemoving(null);
      onReload();
    } catch (e) {
      setRemoveErrs(refusals(e, "The week wasn't removed — try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-sm text-light font-medium">
          Landstar's weekly scale
        </span>
        <span className="text-xs text-muted-text">
          one line a week from the Ranger report · the table is fitted from them
        </span>
      </div>

      {failed ? (
        <FetchFailed
          what="Landstar's weekly scale"
          onRetry={onReload}
          className="mt-3"
        />
      ) : points == null ? (
        <p className="text-sm text-muted-text mt-3">loading…</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {ordered.length > 0 && (
            <div className="rounded py-2" style={{ background: "var(--color-well)" }}>
              {ordered.map((p) => (
                <div key={p.point_id} className="px-3 py-1">
                  <div className="flex items-baseline gap-3 text-sm text-light">
                    <span className="w-[110px] shrink-0">
                      week of {shortDay(p.week_of)}
                    </span>
                    <span className="flex-1">{pointWords(p)}</span>
                    {current?.point_id === p.point_id && (
                      <span className="text-muted-text">this week</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setRemoving(p.point_id)}
                      className="text-xs text-muted-text hover:text-destructive"
                    >
                      remove
                    </button>
                  </div>
                  {removing === p.point_id && (
                    <p className="font-condensed text-[13px] text-light mt-2">
                      Remove the week of {shortDay(p.week_of)}? The scale is
                      re-fitted from the weeks that remain.{" "}
                      <button
                        type="button"
                        onClick={() => remove(p)}
                        disabled={busy}
                        className="font-semibold text-amber-hi hover:text-hot"
                      >
                        Yes
                      </button>{" "}
                      ·{" "}
                      <button
                        type="button"
                        onClick={() => setRemoving(null)}
                        disabled={busy}
                        className="font-semibold text-muted-text hover:text-light"
                      >
                        No
                      </button>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          {removeErrs.map((s, i) => (
            <p key={i} className="font-condensed text-[12px] text-amber-hi">
              {s}
            </p>
          ))}

          <p className="text-xs text-muted-text">
            {fit
              ? `the scale from these points: ${fitWords(fit)}`
              : ordered.length > 0
                ? "two different prices are needed before a scale can be fitted — one report with its PADD lines is enough"
                : "No weekly line yet — paste this week's and par on the Fuel page reads Landstar's own scale."}
          </p>

          {adding ? (
            <PointEditor
              onDone={() => {
                setAdding(false);
                onReload();
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <div>
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="text-xs font-semibold tracking-[.08em] text-amber-hi hover:text-hot mt-1"
              >
                + PASTE THIS WEEK'S LINE · 'National Average $6.292 .86'
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// One band per cent, 30¢ to 150¢, from the fitted scale.
const derivedBands = (fit: FscScaleFit): FscBand[] => {
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const out: FscBand[] = [];
  for (let c = 30; c <= 150; c++) {
    const low = fit.peg + (c / 100 - 0.005) * fit.mpg;
    const high = low + 0.01 * fit.mpg - 0.001;
    out.push({ low: r3(low), high: r3(high), cpm: c / 100 });
  }
  return out;
};

export const FscScheduleBox = () => {
  const todayKey = useLocalTodayKey();
  const [schedules, setSchedules] = useState<FscSchedule[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [eia, setEia] = useState<{ value: number; period: string } | null>(
    null,
  );
  const [eiaFailed, setEiaFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removeErrs, setRemoveErrs] = useState<string[]>([]);
  const [points, setPoints] = useState<FscScalePoint[] | null>(null);
  const [pointsFailed, setPointsFailed] = useState(false);

  useEffect(() => {
    getFscScalePoints()
      .then(setPoints)
      .catch(() => setPointsFailed(true));
    getFscSchedules()
      .then(setSchedules)
      .catch(() => setFailed(true));
    getNationalDiesel()
      .then(setEia)
      .catch(() => setEiaFailed(true));
  }, []);

  // Event-handler reload (after a write or Retry).
  const reload = useCallback(() => {
    setFailed(false);
    getFscSchedules()
      .then(setSchedules)
      .catch(() => setFailed(true));
  }, []);

  const reloadPoints = useCallback(() => {
    setPointsFailed(false);
    getFscScalePoints()
      .then(setPoints)
      .catch(() => setPointsFailed(true));
  }, []);

  const fit = useMemo(() => (points ? fitScale(points) : null), [points]);
  const inForce = useMemo(
    () => (schedules ? scheduleInForce(schedules, todayKey) : null),
    [schedules, todayKey],
  );
  const earlier = useMemo(
    () =>
      schedules
        ? sortSchedules(schedules)
            .filter((s) => s.schedule_id !== inForce?.schedule_id)
            .reverse()
        : [],
    [schedules, inForce],
  );
  const derived = !inForce && fit != null;
  const bands = useMemo(
    () => (inForce ? sortBands(inForce.bands) : fit ? derivedBands(fit) : []),
    [inForce, fit],
  );
  const thisWeek = useMemo(
    () => (eia ? bandFor(bands, eia.value) : null),
    [bands, eia],
  );
  const thisIdx = thisWeek ? bands.indexOf(thisWeek) : -1;

  const done = () => {
    setEditing(false);
    reload();
  };

  const remove = async (s: FscSchedule) => {
    setBusy(true);
    setRemoveErrs([]);
    try {
      await deleteFscSchedule(s.schedule_id);
      setRemoving(null);
      reload();
    } catch (e) {
      setRemoveErrs(refusals(e, "The table wasn't removed — try again."));
    } finally {
      setBusy(false);
    }
  };

  const FOLD_OVER = 6;
  const folded = bands.length > FOLD_OVER && !expanded;
  const last = bands.length - 1;
  const shown = bands
    .map((_, i) => i)
    .filter((i) => !folded || i < 2 || i === thisIdx || i === last);
  const hidden = bands.length - shown.length;

  const row = (i: number) => {
    const b = bands[i];
    const now = i === thisIdx && eia != null;
    return (
      <div
        key={i}
        className={
          "flex items-baseline gap-3 px-3 py-1 text-sm " +
          (now ? "text-light font-bold" : "text-light")
        }
      >
        <span className="w-[150px] shrink-0">{bandWords(b)}</span>
        <span
          className={"flex-1 " + (now ? "" : "text-muted-text font-normal")}
        >
          {now
            ? `this week · EIA $${eia.value.toFixed(3)}`
            : i === 0
              ? "diesel, national average"
              : ""}
        </span>
        <span className="tabular-nums">{centsWords(b.cpm)} / mi</span>
      </div>
    );
  };

  return (
    <div className="mt-4">
      <ScaleSection
        points={points}
        failed={pointsFailed}
        fit={fit}
        todayKey={todayKey}
        onReload={reloadPoints}
      />
      <div className="flex items-baseline gap-2 flex-wrap mt-6">
        <span className="text-sm text-light font-medium">
          Fuel surcharge schedule
        </span>
        {inForce && (
          <span className="text-xs text-muted-text">
            Landstar's band table · effective {dayWords(inForce.effective_from)}{" "}
            · pasted {pastedWords(inForce.created_at)}
          </span>
        )}
      </div>

      {failed ? (
        <FetchFailed
          what="the surcharge tables"
          onRetry={reload}
          className="mt-3"
        />
      ) : schedules == null ? (
        <p className="text-sm text-muted-text mt-3">loading…</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {inForce && (
            <p className="text-xs text-muted-text">
              a pasted table is in force — it wins over the scale until you
              remove it
            </p>
          )}
          {derived && (
            <p className="text-xs text-muted-text">
              the band table, derived from the scale
            </p>
          )}
          {!inForce && !derived ? (
            <p className="text-sm text-muted-text">
              No table pasted yet — par on the Fuel page stays a labelled
              estimate until you paste Landstar's.
            </p>
          ) : (
            <div className="rounded py-2" style={{ background: "var(--color-well)" }}>
              {shown.map((i, k) => (
                <div key={i}>
                  {row(i)}
                  {folded && hidden > 0 && k === 1 && (
                    <button
                      type="button"
                      onClick={() => setExpanded(true)}
                      className="px-3 py-1 text-sm text-muted-text hover:text-light"
                    >
                      … {hidden} more bands
                    </button>
                  )}
                </div>
              ))}
              {expanded && bands.length > FOLD_OVER && (
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="px-3 py-1 text-xs text-muted-text hover:text-light"
                >
                  fold ›
                </button>
              )}
              {eiaFailed && (
                <p className="px-3 pt-1 text-xs text-muted-text">
                  This week's EIA price didn't load, so the band at today's
                  price can't be marked.
                </p>
              )}
              {eia && !thisWeek && (
                <p className="px-3 pt-1 text-xs text-amber-hi">
                  This week's EIA ${eia.value.toFixed(3)} is below the table's
                  first band.
                </p>
              )}
              {inForce && (
                <div className="px-3 pt-2">
                  {removing === inForce.schedule_id ? (
                    <RemoveAsk
                      schedule={inForce}
                      busy={busy}
                      onYes={() => remove(inForce)}
                      onNo={() => setRemoving(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRemoving(inForce.schedule_id)}
                      className="text-xs text-muted-text hover:text-destructive"
                    >
                      remove
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {earlier.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-muted-text">Earlier tables</p>
              {earlier.map((s) => (
                <div key={s.schedule_id} className="px-3 py-1">
                  <p className="text-sm text-light">
                    effective {dayWords(s.effective_from)} · pasted{" "}
                    {pastedWords(s.created_at)} · {s.bands.length} bands ·{" "}
                    <button
                      type="button"
                      onClick={() => setRemoving(s.schedule_id)}
                      className="text-muted-text hover:text-destructive"
                    >
                      remove
                    </button>
                  </p>
                  {removing === s.schedule_id && (
                    <RemoveAsk
                      schedule={s}
                      busy={busy}
                      onYes={() => remove(s)}
                      onNo={() => setRemoving(null)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          {removeErrs.map((s, i) => (
            <p key={i} className="font-condensed text-[12px] text-amber-hi">
              {s}
            </p>
          ))}

          {editing ? (
            <Editor onDone={done} onCancel={() => setEditing(false)} />
          ) : (
            <div>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-xs font-semibold tracking-[.08em] text-amber-hi hover:text-hot mt-1"
              >
                PASTE A NEW TABLE · with its effective date
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
