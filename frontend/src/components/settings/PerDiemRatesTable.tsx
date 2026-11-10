import { useCallback, useEffect, useMemo, useState } from "react";
import type { PerDiemRate } from "@/types/perDiemRate";
import {
  getPerDiemRates,
  createPerDiemRate,
  updatePerDiemRate,
  deletePerDiemRate,
} from "@/services/perDiemRateService";
import { dayWords, moneyRate, rateInForce } from "@/lib/perDiem/rates";
import { useLocalTodayKey } from "@/hooks/useLocalToday";
import { FetchFailed } from "@/components/integrity/FetchFailed";

// The server's refusal sentences — a list under `details`, else the one error.
const refusals = (e: unknown): string[] => {
  const data = (e as { response?: { data?: { details?: unknown; error?: string; message?: string } } })
    ?.response?.data;
  if (Array.isArray(data?.details) && data.details.length > 0) return data.details.map(String);
  const one = data?.error || data?.message;
  return [one ? String(one) : "The rate wasn't saved — try again."];
};

interface EditorProps {
  existing: PerDiemRate | null; // null = a new row
  onDone: () => void; // saved or removed: reload the list and close
  onCancel: () => void;
}

const Editor = ({ existing, onDone, onCancel }: EditorProps) => {
  const [from, setFrom] = useState(existing?.effective_from ?? "");
  const [rate, setRate] = useState(existing ? String(existing.rate) : "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);

  const save = async () => {
    setBusy(true);
    setErrs([]);
    try {
      const input = { effective_from: from, rate: Number(rate), note: note.trim() || null };
      if (existing) await updatePerDiemRate(existing.rate_id, input);
      else await createPerDiemRate(input);
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
      await deletePerDiemRate(existing.rate_id);
      onDone();
    } catch (e) {
      setErrs(refusals(e));
      setBusy(false);
    }
  };

  const field = "bg-steel rounded px-2 py-1.5 text-light text-sm";
  return (
    <div className="rounded px-3 py-3" style={{ background: "var(--color-well)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className={field}
          aria-label="Start date"
        />
        <span className="text-muted-text">$</span>
        <input
          type="number"
          min={1}
          max={500}
          step={0.01}
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          className={field + " w-24 text-right tabular-nums"}
          aria-label="Rate per day"
        />
        <span className="text-muted-text text-sm">/ day</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="where the number came from — IRS Notice …"
          className={field + " flex-1 min-w-[220px]"}
          aria-label="Note"
        />
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button
          type="button"
          onClick={save}
          disabled={busy || !from || rate === ""}
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
          Remove the {moneyRate(existing.rate)} rate from {dayWords(existing.effective_from)}? Days it priced
          will have no rate.{" "}
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

export const PerDiemRatesTable = () => {
  const today = useLocalTodayKey();
  const [rates, setRates] = useState<PerDiemRate[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); // rate_id, "new", or null

  useEffect(() => {
    getPerDiemRates()
      .then(setRates)
      .catch(() => setFailed(true));
  }, []);

  // Event-handler reload (after a write or Retry).
  const reload = useCallback(() => {
    setFailed(false);
    getPerDiemRates()
      .then(setRates)
      .catch(() => setFailed(true));
  }, []);

  const inForce = useMemo(() => (rates ? rateInForce(rates, today) : null), [rates, today]);

  const done = () => {
    setEditing(null);
    reload();
  };

  return (
    <div className="mt-4">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-sm text-light font-medium">Per diem rates</span>
        <span className="text-xs text-muted-text">the IRS transportation rate · each row from its start date</span>
      </div>

      {failed ? (
        <FetchFailed what="the per-diem rates" onRetry={reload} className="mt-3" />
      ) : rates == null ? (
        <p className="text-sm text-muted-text mt-3">loading rates…</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {rates.length === 0 && editing !== "new" && (
            <p className="text-sm text-muted-text">
              No rate on file — every day out is unpriced until you add one.
            </p>
          )}
          {rates.map((r) =>
            editing === r.rate_id ? (
              <Editor key={r.rate_id} existing={r} onDone={done} onCancel={() => setEditing(null)} />
            ) : (
              <div
                key={r.rate_id}
                className="flex items-center gap-3 rounded px-3 py-2"
                style={{ background: "var(--color-well)" }}
              >
                <span className="text-sm text-muted-text w-[130px] shrink-0">from {dayWords(r.effective_from)}</span>
                <span className="text-sm text-light flex-1">
                  <b>{moneyRate(r.rate)} / day</b>
                  {r.note && <span className="text-muted-text"> {r.note}</span>}
                  {inForce?.rate_id === r.rate_id && <span className="text-muted-text"> · in force today</span>}
                </span>
                <button
                  type="button"
                  onClick={() => setEditing(r.rate_id)}
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
                + ADD A RATE · from a date
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
