import { useCallback, useEffect, useMemo, useState } from "react";
import type { SettlementSplit } from "@/types/settlementSplit";
import {
  getSettlementSplits,
  createSettlementSplit,
  updateSettlementSplit,
  deleteSettlementSplit,
} from "@/services/settlementSplitService";
import { dayWords, splitInForce, splitWords, sortSplits } from "@/lib/metrics/splits";
import { localDayKey } from "@/lib/metrics/today";
import { useLocalTodayKey } from "@/hooks/useLocalToday";
import { FetchFailed } from "@/components/integrity/FetchFailed";

// The server's refusal sentences — a list under `details`, else the one error.
const refusals = (e: unknown): string[] => {
  const data = (e as { response?: { data?: { details?: unknown; error?: string } }; message?: string })
    ?.response?.data;
  if (Array.isArray(data?.details) && data.details.length > 0) return data.details.map(String);
  const one = data?.error || (e as { message?: string })?.message;
  return [one ? String(one) : "The schedule wasn't saved — try again."];
};

// whole percent text from a fraction (0.65 → "65", 0.125 → "12.5")
const pctText = (f: number): string => String(Math.round(f * 1000) / 10);

interface EditorProps {
  existing: SettlementSplit | null; // null = a new schedule
  onDone: () => void;
  onCancel: () => void;
}

const Editor = ({ existing, onDone, onCancel }: EditorProps) => {
  const [from, setFrom] = useState(existing?.effective_from ?? localDayKey(new Date()));
  const [lh, setLh] = useState(existing ? pctText(existing.linehaul_pct) : "");
  const [tr, setTr] = useState(existing ? pctText(existing.trailer_pct) : "");
  const [fsc, setFsc] = useState(existing ? pctText(existing.fuel_surcharge_pct) : "");
  const [acc, setAcc] = useState(existing ? pctText(existing.accessorial_pct) : "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);

  const filled = from !== "" && [lh, tr, fsc, acc].every((v) => v.trim() !== "" && Number.isFinite(Number(v)));

  const save = async () => {
    setBusy(true);
    setErrs([]);
    try {
      const input = {
        effective_from: from,
        linehaul_pct: Number(lh) / 100,
        trailer_pct: Number(tr) / 100,
        fuel_surcharge_pct: Number(fsc) / 100,
        accessorial_pct: Number(acc) / 100,
        note: note.trim() || null,
      };
      if (existing) await updateSettlementSplit(existing.split_id, input);
      else await createSettlementSplit(input);
      onDone();
    } catch (e) {
      setErrs(refusals(e));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    setBusy(true);
    setErrs([]);
    try {
      await deleteSettlementSplit(existing.split_id);
      onDone();
    } catch (e) {
      setErrs(refusals(e));
      setBusy(false);
    }
  };

  const field = "bg-steel rounded px-2 py-1.5 text-light text-sm";
  const pctInput = (label: string, value: string, set: (v: string) => void) => (
    <label className="flex items-center gap-1.5 text-sm text-muted-text">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        max={200}
        step={0.5}
        value={value}
        onChange={(e) => set(e.target.value)}
        className={field + " w-20 text-right tabular-nums"}
        aria-label={label}
      />
    </label>
  );

  return (
    <div className="rounded px-3 py-3" style={{ background: "var(--color-well)" }}>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className={field}
          aria-label="Effective date"
        />
        {pctInput("linehaul %", lh, setLh)}
        {pctInput("trailer %", tr, setTr)}
        {pctInput("fuel surcharge %", fsc, setFsc)}
        {pctInput("accessorials %", acc, setAcc)}
      </div>
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="why it changed — the trailer's share began with the trailer"
        className={field + " w-full mt-3"}
        aria-label="Note"
      />
      <div className="flex items-center gap-3 mt-3">
        <button
          type="button"
          onClick={save}
          disabled={busy || !filled}
          className="bg-amber text-steel px-3 py-1.5 rounded text-sm font-semibold disabled:opacity-50"
        >
          Save
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="text-sm text-muted-text hover:text-light">
          Cancel
        </button>
        {existing && !confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={busy}
            className="ml-auto text-sm text-muted-text hover:text-destructive"
          >
            Remove
          </button>
        )}
      </div>
      {existing && confirming && (
        <p className="font-condensed text-[14px] text-light mt-3">
          Remove the {dayWords(existing.effective_from)} schedule? Loads it settled move to the row before it.{" "}
          <button type="button" onClick={remove} disabled={busy} className="font-semibold text-amber-hi hover:text-hot">
            Yes
          </button>{" "}
          ·{" "}
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="font-semibold text-muted-text hover:text-light"
          >
            No
          </button>
        </p>
      )}
      {errs.map((s, i) => (
        <p key={i} className="font-condensed text-[13px] text-amber-hi mt-2">
          {s}
        </p>
      ))}
    </div>
  );
};

export const SettlementSplitsTable = () => {
  const today = useLocalTodayKey();
  const [splits, setSplits] = useState<SettlementSplit[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); // split_id, "new", or null

  useEffect(() => {
    getSettlementSplits()
      .then(setSplits)
      .catch(() => setFailed(true));
  }, []);

  // Event-handler reload (after a write or Retry).
  const reload = useCallback(() => {
    setFailed(false);
    getSettlementSplits()
      .then(setSplits)
      .catch(() => setFailed(true));
  }, []);

  const rows = useMemo(() => (splits ? sortSplits(splits).reverse() : null), [splits]);
  const inForce = useMemo(() => (splits ? splitInForce(splits, today) : null), [splits, today]);

  const done = () => {
    setEditing(null);
    reload();
  };

  return (
    <div className="mt-4">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-sm text-light font-medium">Settlement schedule</span>
        <span className="text-xs text-muted-text">the split in force by date</span>
      </div>

      {failed ? (
        <FetchFailed what="the settlement schedule" onRetry={reload} className="mt-3" />
      ) : rows == null ? (
        <p className="text-sm text-muted-text mt-3">loading…</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {rows.length === 0 && editing !== "new" && (
            <p className="text-sm text-muted-text">
              No schedule on file — every load needs one in force. Start one from the day your loads begin.
            </p>
          )}
          {rows.map((r) =>
            editing === r.split_id ? (
              <Editor key={r.split_id} existing={r} onDone={done} onCancel={() => setEditing(null)} />
            ) : (
              <div
                key={r.split_id}
                className="flex items-center gap-3 rounded px-3 py-2"
                style={{ background: "var(--color-well)" }}
              >
                <span className="text-sm text-muted-text w-[130px] shrink-0">from {dayWords(r.effective_from)}</span>
                <span className="text-sm text-light flex-1">
                  <b>{splitWords(r)}</b>
                  {r.note && <span className="text-muted-text"> {r.note}</span>}
                  {inForce?.split_id === r.split_id && <span className="text-muted-text"> · in force today</span>}
                </span>
                <button
                  type="button"
                  onClick={() => setEditing(r.split_id)}
                  className="text-xs font-semibold tracking-[.08em] text-amber-hi hover:text-hot"
                >
                  EDIT ›
                </button>
              </div>
            ),
          )}
          {editing === "new" ? (
            <Editor existing={null} onDone={done} onCancel={() => setEditing(null)} />
          ) : (
            <div>
              <button
                type="button"
                onClick={() => setEditing("new")}
                className="text-xs font-semibold tracking-[.08em] text-amber-hi hover:text-hot mt-1"
              >
                + START A NEW SCHEDULE · from a date
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
