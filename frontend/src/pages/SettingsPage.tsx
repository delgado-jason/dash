import { useEffect, useState } from "react";
import {
  getSettlementSchedule,
  updateSettlementSchedule,
} from "@/services/settlementScheduleService";
import { AccessorialRatesCard } from "@/components/settings/AccessorialRatesCard";
import { Panel } from "@/components/ui/Panel";

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// A sample load for the live preview, so the effect of the percentages is visible.
const SAMPLE_LINEHAUL = 2000;
const SAMPLE_FSC = 300;

type Pcts = {
  linehaul: number;
  trailer: number;
  fsc: number;
  accessorial: number;
};

const Field = ({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help: string;
  value: number;
  onChange: (v: number) => void;
}) => (
  <label className="block">
    <span className="text-sm text-light">{label}</span>
    <div className="flex items-center gap-2 mt-1">
      <input
        type="number"
        min={0}
        max={200}
        step={0.5}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24 bg-steel rounded px-2 py-1.5 text-light text-right tabular-nums"
      />
      <span className="text-muted-text">%</span>
    </div>
    <span className="text-xs text-muted-text mt-1 block">{help}</span>
  </label>
);

const SettingsPage = () => {
  const [pcts, setPcts] = useState<Pcts | null>(null);
  const [carrier, setCarrier] = useState("");
  const [freeHours, setFreeHours] = useState(3);
  const [perDiemRate, setPerDiemRate] = useState(69);
  const [perDiemPct, setPerDiemPct] = useState(80); // stored as %, saved as fraction
  const [hometimeThresh, setHometimeThresh] = useState(21);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getSettlementSchedule()
      .then((s) => {
        setPcts({
          linehaul: s.linehaul_pct * 100,
          trailer: s.trailer_pct * 100,
          fsc: s.fuel_surcharge_pct * 100,
          accessorial: s.accessorial_pct * 100,
        });
        setCarrier(s.carrier_name ?? "");
        setFreeHours(s.detention_free_hours);
        setPerDiemRate(s.per_diem_rate);
        setPerDiemPct(Math.round(s.per_diem_deduct_pct * 100));
        setHometimeThresh(s.hometime_threshold_days);
      })
      .catch(() => setErr("Couldn't load your settlement schedule."));
  }, []);

  const set = (k: keyof Pcts) => (v: number) => {
    setMsg(null);
    setPcts((p) => (p ? { ...p, [k]: v } : p));
  };

  const save = async () => {
    if (!pcts) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      await updateSettlementSchedule({
        linehaul_pct: pcts.linehaul / 100,
        trailer_pct: pcts.trailer / 100,
        fuel_surcharge_pct: pcts.fsc / 100,
        accessorial_pct: pcts.accessorial / 100,
        carrier_name: carrier.trim() || null,
        detention_free_hours: freeHours,
        per_diem_rate: perDiemRate,
        per_diem_deduct_pct: perDiemPct / 100,
        hometime_threshold_days: hometimeThresh,
      });
      setMsg("Saved. Your revenue and targets now use this split.");
    } catch (e) {
      setErr(
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Couldn't save — check the values and try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const gross = SAMPLE_LINEHAUL + SAMPLE_FSC;
  const net = pcts
    ? SAMPLE_LINEHAUL * ((pcts.linehaul + pcts.trailer) / 100) +
      SAMPLE_FSC * (pcts.fsc / 100)
    : gross;
  const effLinehaul = pcts ? pcts.linehaul + pcts.trailer : 100;

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <h1 className="text-3xl font-condensed">Settings</h1>

      <Panel className="mt-6 max-w-[680px] p-5">
        <h2 className="text-lg font-medium text-light">Settlement schedule</h2>
        <p className="text-sm text-muted-text mt-1">
          Your carrier's pay split. You keep entering each load's full customer
          rate — this turns it into what your company actually grosses after the
          carrier's cut. Revenue, RPM, and your rate targets all use it. Leave
          everything at 100% if you run under your own authority.
        </p>

        <label className="block mt-4">
          <span className="text-sm text-light">Carrier name</span>
          <input
            type="text"
            placeholder="e.g. Landstar"
            value={carrier}
            onChange={(e) => {
              setMsg(null);
              setCarrier(e.target.value);
            }}
            className="w-full max-w-xs mt-1 bg-steel rounded px-2 py-1.5 text-light text-sm block"
          />
          <span className="text-xs text-muted-text mt-1 block">
            Shown on your agents. Leave blank if you run on your own authority.
          </span>
        </label>

        {!pcts ? (
          <p className="text-muted-text mt-5">Loading…</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-5">
              <Field
                label="Linehaul"
                help="Your base % of the linehaul (leased on ~65%; own authority 100%)."
                value={pcts.linehaul}
                onChange={set("linehaul")}
              />
              <Field
                label="Trailer"
                help="Extra % of linehaul for furnishing your trailer (flatbed: 8%)."
                value={pcts.trailer}
                onChange={set("trailer")}
              />
              <Field
                label="Fuel surcharge"
                help="Share of the fuel surcharge you keep (usually 100%)."
                value={pcts.fsc}
                onChange={set("fsc")}
              />
              <Field
                label="Accessorials"
                help="Default share of accessorial charges (tarp, detention, etc.)."
                value={pcts.accessorial}
                onChange={set("accessorial")}
              />
            </div>

            <div
              className="mt-5 rounded-lg p-4 flex flex-wrap items-center gap-x-6 gap-y-2"
              style={{ background: "#0d1119" }}
            >
              <div className="text-sm text-muted-text">
                Effective linehaul take{" "}
                <span className="text-amber font-semibold">
                  {effLinehaul.toFixed(0)}%
                </span>
              </div>
              <div className="text-sm text-muted-text">
                Sample: {money(SAMPLE_LINEHAUL)} linehaul + {money(SAMPLE_FSC)}{" "}
                FSC ={" "}
                <span className="line-through">{money(gross)}</span>{" "}
                <span className="text-status-positive-text font-semibold">
                  {money(net)} net
                </span>
              </div>
            </div>

            {msg && (
              <p className="text-status-positive-text text-sm mt-4">{msg}</p>
            )}
            {err && <p className="text-destructive text-sm mt-4">{err}</p>}

            <button
              onClick={save}
              disabled={saving}
              className="mt-4 bg-amber text-steel px-4 py-2 rounded font-semibold disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save schedule"}
            </button>
          </>
        )}
      </Panel>

      <Panel className="mt-6 max-w-[680px] p-5">
        <h2 className="text-lg font-medium text-light">Detention</h2>
        <p className="text-sm text-muted-text mt-1">
          Free time at a stop before detention starts accruing, applied to the
          shipper and receiver separately. A load whose dwell runs past this gets
          flagged "detention owed" until you mark it paid.
        </p>
        <label className="block mt-4">
          <span className="text-sm text-light">Free hours (per stop)</span>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="number"
              min={0}
              max={24}
              step={0.5}
              value={Number.isFinite(freeHours) ? freeHours : ""}
              onChange={(e) => {
                setMsg(null);
                setFreeHours(Number(e.target.value));
              }}
              className="w-24 bg-steel rounded px-2 py-1.5 text-light text-right tabular-nums"
            />
            <span className="text-muted-text">hours</span>
          </div>
          <span className="text-xs text-muted-text mt-1 block">
            Saved with the schedule above.
          </span>
        </label>
      </Panel>

      <Panel className="mt-6 max-w-[680px] p-5">
        <h2 className="text-lg font-medium text-light">Per diem</h2>
        <p className="text-sm text-muted-text mt-1">
          The IRS special M&amp;IE daily rate and your deductible share. The rate
          updates each October; DOT hours-of-service drivers deduct 80%. Drives the
          Per Diem tracker's totals.
        </p>
        <div className="flex flex-wrap gap-6 mt-4">
          <label className="block">
            <span className="text-sm text-light">Daily rate</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-muted-text">$</span>
              <input
                type="number"
                min={0}
                max={500}
                step={1}
                value={Number.isFinite(perDiemRate) ? perDiemRate : ""}
                onChange={(e) => {
                  setMsg(null);
                  setPerDiemRate(Number(e.target.value));
                }}
                className="w-24 bg-steel rounded px-2 py-1.5 text-light text-right tabular-nums"
              />
              <span className="text-muted-text">/ day</span>
            </div>
          </label>
          <label className="block">
            <span className="text-sm text-light">Deductible</span>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                min={0}
                max={100}
                step={5}
                value={Number.isFinite(perDiemPct) ? perDiemPct : ""}
                onChange={(e) => {
                  setMsg(null);
                  setPerDiemPct(Number(e.target.value));
                }}
                className="w-24 bg-steel rounded px-2 py-1.5 text-light text-right tabular-nums"
              />
              <span className="text-muted-text">%</span>
            </div>
          </label>
        </div>
        <span className="text-xs text-muted-text mt-3 block">
          Saved with the schedule above.
        </span>
      </Panel>

      <Panel className="mt-6 max-w-[680px] p-5">
        <h2 className="text-lg font-medium text-light">Hometime</h2>
        <p className="text-sm text-muted-text mt-1">
          How many days out before the driver page flags your hometime. "Days
          out" counts from your most recent home day on the Per Diem calendar, so
          mark home days there to keep it accurate.
        </p>
        <label className="block mt-4">
          <span className="text-sm text-light">Flag after</span>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="number"
              min={1}
              max={365}
              step={1}
              value={Number.isFinite(hometimeThresh) ? hometimeThresh : ""}
              onChange={(e) => {
                setMsg(null);
                setHometimeThresh(Math.round(Number(e.target.value)));
              }}
              className="w-24 bg-steel rounded px-2 py-1.5 text-light text-right tabular-nums"
            />
            <span className="text-muted-text">days out</span>
          </div>
          <span className="text-xs text-muted-text mt-1 block">
            Saved with the schedule above.
          </span>
        </label>
      </Panel>

      <AccessorialRatesCard />
    </div>
  );
};

export default SettingsPage;
