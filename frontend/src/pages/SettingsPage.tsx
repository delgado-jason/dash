import { DEFAULT_DETENTION_FREE_HOURS } from "@/lib/detention";
import { RateDial } from "@/components/settings/RateDial";
import { useEffect, useState } from "react";
import {
  getSettlementSchedule,
  updateSettlementSchedule,
} from "@/services/settlementScheduleService";
import { getTeam, updateMyName } from "@/services/teamService";
import { useLoads } from "@/hooks/useLoads";
import { useRateTargets } from "@/hooks/useRateTargets";
import { AccessorialRatesCard } from "@/components/settings/AccessorialRatesCard";
import { CutTiersCard } from "@/components/settings/CutTiersCard";
import { SettlementSplitsTable } from "@/components/settings/SettlementSplitsTable";
import { PerDiemRatesTable } from "@/components/settings/PerDiemRatesTable";
import { FscScheduleBox } from "@/components/settings/FscScheduleBox";
import { TeamCard } from "@/components/settings/TeamCard";
import { useTheme } from "@/hooks/useTheme";
import { Panel } from "@/components/ui/Panel";
import { money } from "@/lib/format";

type Tier3 = { min: number; target: number; strong: number };
// Tiers are SET via the RateDial slider; this stored percent shape is unchanged.
const pct = (x: number) => Math.round(x * 1000) / 10; // fraction → clean percent

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const SettingsPage = () => {
  const [loaded, setLoaded] = useState(false);
  const [carrier, setCarrier] = useState("");
  const [freeHours, setFreeHours] = useState(DEFAULT_DETENTION_FREE_HOURS);
  const [settlementDay, setSettlementDay] = useState(3); // 0=Sun … 6=Sat; default Wednesday
  const [depositLag, setDepositLag] = useState(1); // days after the settlement the cash lands
  const [perDiemPct, setPerDiemPct] = useState(80); // stored as %, saved as fraction
  const [hometimeThresh, setHometimeThresh] = useState(42);
  const [operation, setOperation] = useState("flatbed");
  const [stdTiers, setStdTiers] = useState<Tier3>({ min: 10, target: 20, strong: 30 });
  const [specTiers, setSpecTiers] = useState<Tier3>({ min: 35, target: 45, strong: 60 });
  const [marginGoal, setMarginGoal] = useState(26);
  // Held as the raw string so an empty box stays empty. Blank is a REAL answer
  // here — it means "no commitment", and the rate floor falls back to measured
  // miles. Coercing it to 0 would send the floor to infinity.
  const [targetMiles, setTargetMiles] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { preference: themePreference, resolved: resolvedTheme, setPreference: setThemePreference } = useTheme();
  const [displayName, setDisplayName] = useState("");

  // Real break-even for the tier previews + weekly-target preview (cost-based,
  // so it's independent of the tier values being edited).
  const { loads } = useLoads(0);
  const targets = useRateTargets(loads);
  const be = targets.bookingLadder.walkAway;
  const weeklyBE = targets.gross.weeklyBreakEven;

  useEffect(() => {
    getSettlementSchedule()
      .then((s) => {
        setLoaded(true);
        setCarrier(s.carrier_name ?? "");
        setSettlementDay(s.settlement_day);
        setDepositLag(s.deposit_lag_days);
        setFreeHours(s.detention_free_hours);
        setPerDiemPct(Math.round(s.per_diem_deduct_pct * 100));
        setHometimeThresh(s.hometime_threshold_days);
        setTargetMiles(
          s.target_miles_per_month == null ? "" : String(s.target_miles_per_month),
        );
        setOperation(s.operation);
        setStdTiers({
          min: pct(s.rate_tier_std_min),
          target: pct(s.rate_tier_std_target),
          strong: pct(s.rate_tier_std_strong),
        });
        setSpecTiers({
          min: pct(s.rate_tier_spec_min),
          target: pct(s.rate_tier_spec_target),
          strong: pct(s.rate_tier_spec_strong),
        });
        setMarginGoal(pct(s.margin_goal));
      })
      .catch(() => setErr("Couldn't load your settlement schedule."));
  }, []);

  useEffect(() => {
    const selfId = localStorage.getItem("user_id");
    getTeam()
      .then((t) => {
        const me = t.find((m) => m.user_id === selfId);
        if (me) setDisplayName(me.display_name ?? "");
      })
      .catch(() => {});
  }, []);

  const ascends = (t: Tier3) => t.min <= t.target && t.target <= t.strong;
  const tierErr = !ascends(stdTiers)
    ? "Standard tiers must climb: min ≤ target ≤ strong."
    : !ascends(specTiers)
      ? "Specialized tiers must climb: min ≤ target ≤ strong."
      : null;

  const save = async () => {
    if (!loaded || tierErr) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      await updateSettlementSchedule({
        carrier_name: carrier.trim() || null,
        settlement_day: settlementDay,
        deposit_lag_days: depositLag,
        detention_free_hours: freeHours,
        per_diem_deduct_pct: perDiemPct / 100,
        hometime_threshold_days: hometimeThresh,
        operation,
        rate_tier_std_min: stdTiers.min / 100,
        rate_tier_std_target: stdTiers.target / 100,
        rate_tier_std_strong: stdTiers.strong / 100,
        rate_tier_spec_min: specTiers.min / 100,
        rate_tier_spec_target: specTiers.target / 100,
        rate_tier_spec_strong: specTiers.strong / 100,
        margin_goal: marginGoal / 100,
        // Blank clears the commitment; the validator takes null for that.
        target_miles_per_month: targetMiles.trim() === "" ? null : Number(targetMiles),
      });
      await updateMyName(displayName.trim());
      setMsg("Saved.");
    } catch (e) {
      setErr(
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Couldn't save — check the values and try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const weeklyTarget =
    weeklyBE != null && marginGoal < 100
      ? weeklyBE / (1 - marginGoal / 100)
      : null;

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <h1 className="text-3xl font-condensed">Settings</h1>

      {localStorage.getItem("role") === "admin" && <TeamCard />}

      <Panel className="mt-6 max-w-[680px] p-5">
        <h2 className="text-lg font-medium text-light">Appearance</h2>
        <p className="text-sm text-muted-text mt-1">
          How dash paints itself on this device. System follows the device and
          changes with it; Light and Dark hold. Remembered on this device only —
          the phone can be dark while the laptop is light.
        </p>
        <div role="radiogroup" aria-label="Appearance" className="mt-4 inline-flex overflow-hidden rounded-md border border-hairline text-sm">
          {(["system", "light", "dark"] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={themePreference === p}
              onClick={() => setThemePreference(p)}
              className={`px-4 py-1.5 font-condensed transition-colors ${
                themePreference === p ? "bg-amber text-on-amber font-semibold" : "text-dim hover:text-ink"
              }`}
            >
              {p === "system" ? "System" : p === "light" ? "Light" : "Dark"}
            </button>
          ))}
        </div>
        <p className="text-xs text-faint mt-2">
          Showing {resolvedTheme} now{themePreference === "system" ? " · following the device" : ""}.
        </p>
      </Panel>

      <Panel className="mt-6 max-w-[680px] p-5">
        <h2 className="text-lg font-medium text-light">Your name</h2>
        <p className="text-sm text-muted-text mt-1">
          Shown as the booker on loads you book (instead of your email), and
          anywhere the app credits you.
        </p>
        <label className="block mt-4 max-w-xs">
          <input
            type="text"
            placeholder="e.g. Jason Delgado"
            value={displayName}
            onChange={(e) => {
              setMsg(null);
              setDisplayName(e.target.value);
            }}
            className="w-full mt-1 bg-steel rounded px-2 py-1.5 text-light text-sm block"
          />
        </label>
      </Panel>

      <Panel className="mt-6 max-w-[680px] p-5">
        <h2 className="text-lg font-medium text-light">Settlement schedule</h2>
        <p className="text-sm text-muted-text mt-1">
          Your carrier's pay split — linehaul, trailer, fuel surcharge and the
          accessorial fallback — by the date it took effect. A load settles on
          the split in force on its delivery day; edit a row to fix it in place,
          or start a new schedule from the day the split changed.
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

        <label className="block mt-4">
          <span className="text-sm text-light">Settlement day</span>
          <select
            value={settlementDay}
            onChange={(e) => {
              setMsg(null);
              setSettlementDay(Number(e.target.value));
            }}
            className="w-full max-w-xs mt-1 bg-steel rounded px-2 py-1.5 text-light text-sm block"
          >
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-text mt-1 block">
            The day your carrier's weekly settlement lands. Drives the "next
            settlement" line on the dashboard.
          </span>
        </label>

        <label className="block mt-4">
          <span className="text-sm text-light">Cash lands</span>
          <select
            value={depositLag}
            onChange={(e) => {
              setMsg(null);
              setDepositLag(Number(e.target.value));
            }}
            className="w-full max-w-xs mt-1 bg-steel rounded px-2 py-1.5 text-light text-sm block"
          >
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "The same day" : n === 1 ? "The next day" : `${n} days after`}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-text mt-1 block">
            How long after the statement the money is actually in the bank —{" "}
            {WEEKDAYS[settlementDay]} statement, {WEEKDAYS[(settlementDay + depositLag) % 7]}{" "}
            cash. The cash board dates every deposit by it.
          </span>
        </label>

        <SettlementSplitsTable />

        {!loaded ? (
          <p className="text-muted-text mt-5">Loading…</p>
        ) : (
          <>
            {msg && (
              <p className="text-status-positive-text text-sm mt-4">{msg}</p>
            )}
            {err && <p className="text-destructive text-sm mt-4">{err}</p>}
            {tierErr && (
              <p className="text-destructive text-sm mt-4">
                {tierErr} (in Rate tiers below)
              </p>
            )}

            <button
              onClick={save}
              disabled={saving || !!tierErr}
              className="mt-4 bg-amber text-steel px-4 py-2 rounded font-semibold disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save schedule"}
            </button>
          </>
        )}
      </Panel>

      <Panel className="mt-6 max-w-[680px] p-5">
        <h2 className="text-lg font-medium text-light">The rate dial</h2>
        <p className="text-sm text-muted-text mt-1">
          Slide to the <span className="text-light">margin you're pricing for</span> —
          the three rungs derive from it (target −5 / target / target +5) and save
          as the same markups the Scorer, counter-rate ladder, and rate ladders
          have always read. The gap between your handle and the goal marker is
          your padding for what the road takes. Specialized (oversize, hazmat,
          heavy haul) carries its own dial.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          <RateDial
            label="Standard"
            dot="var(--color-chart-blue)"
            tiers={stdTiers}
            onChange={(t) => {
              setMsg(null);
              setStdTiers(t);
            }}
            be={be}
            marginGoalPct={Number.isFinite(marginGoal) ? marginGoal : 15}
            windowLabel={targets.basis.windowLabel}
          />
          <RateDial
            label="Specialized"
            dot="var(--color-cat4)"
            tiers={specTiers}
            onChange={(t) => {
              setMsg(null);
              setSpecTiers(t);
            }}
            be={be}
            marginGoalPct={Number.isFinite(marginGoal) ? marginGoal : 15}
            windowLabel={targets.basis.windowLabel}
          />
        </div>
        {tierErr ? (
          <p className="text-destructive text-xs mt-3">{tierErr}</p>
        ) : (
          <p className="text-xs text-muted-text mt-3">
            Each set must climb: min ≤ target ≤ strong. Saved with the schedule
            above.
          </p>
        )}
      </Panel>

      <Panel className="mt-6 max-w-[680px] p-5">
        <h2 className="text-lg font-medium text-light">Margin goal</h2>
        <p className="text-sm text-muted-text mt-1">
          Your target profit margin (profit ÷ revenue). Sets your weekly and daily
          revenue targets — the grind streak and recap. Independent of the rate
          tiers above.
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4">
          <label className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={95}
              step={1}
              value={Number.isFinite(marginGoal) ? marginGoal : ""}
              onChange={(e) => {
                setMsg(null);
                setMarginGoal(Number(e.target.value));
              }}
              className="w-20 bg-steel rounded px-2 py-1.5 text-light text-right tabular-nums"
            />
            <span className="text-muted-text">%</span>
          </label>
          <span className="text-xs text-muted-text">
            {weeklyTarget != null
              ? `weekly revenue target ≈ ${money(weeklyTarget)}`
              : "add a few months of P&L to preview your weekly target"}
          </span>
        </div>
        <span className="text-xs text-muted-text mt-3 block">
          Saved with the schedule above.
        </span>
      </Panel>

      {/* The commitment the rate floor is derived from (migration 109). It sits
          beside the margin goal and the hometime threshold because it is the
          same kind of number — one you DECIDE, not one dash measures. */}
      <Panel className="mt-6 max-w-[680px] p-5">
        <h2 className="text-lg font-medium text-light">Monthly mileage commitment</h2>
        <p className="text-sm text-muted-text mt-1">
          The driven miles you commit to in a month. Your rate floor is your
          fixed cost spread over <em>this</em> figure, not over whatever the
          month happens to do — so a slow month warns you on the dashboard
          instead of quietly telling you to quote higher.
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4">
          <label className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={40000}
              step={100}
              value={targetMiles}
              onChange={(e) => {
                setMsg(null);
                setTargetMiles(e.target.value);
              }}
              className="w-28 bg-steel rounded px-2 py-1.5 text-light text-right tabular-nums"
            />
            <span className="text-muted-text">miles / month</span>
          </label>
          <span className="text-xs text-muted-text">
            {targetMiles.trim() === ""
              ? "empty — the floor falls back to the miles you actually drove"
              : "held until you change it; re-set it once a quarter"}
          </span>
        </div>
        <span className="text-xs text-muted-text mt-3 block">
          Saved with the schedule above.
        </span>
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
          The IRS transportation rate, each row from its start date — add a row on
          the day the IRS rate changes (Oct 1 in a change year); past years keep the
          rate they were filed at. Your deductible share is saved with the schedule
          above.
        </p>
        <PerDiemRatesTable />
        <div className="flex flex-wrap gap-6 mt-4">
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
        <h2 className="text-lg font-medium text-light">Fuel surcharge schedule</h2>
        <p className="text-sm text-muted-text mt-1">
          Landstar's fuel-surcharge band table — paste it with its effective date whenever Landstar
          publishes a new one. Every table is kept; a month's par on the Fuel page reads the table in
          force then at that month's national diesel price.
        </p>
        <FscScheduleBox />
      </Panel>

      <Panel className="mt-6 max-w-[680px] p-5">
        <h2 className="text-lg font-medium text-light">Operation</h2>
        <p className="text-sm text-muted-text mt-1">
          Your equipment and discipline. It tailors your achievements — open-deck
          operations (flatbed, heavy haul, oversize) earn the oversize badge set;
          others keep the universal badges.
        </p>
        <label className="block mt-4">
          <span className="text-sm text-light">Operation type</span>
          <select
            value={operation}
            onChange={(e) => {
              setMsg(null);
              setOperation(e.target.value);
            }}
            className="block mt-1 w-56 bg-steel rounded px-2 py-1.5 text-light"
          >
            <option value="flatbed">Flatbed / Platform</option>
            <option value="heavy haul">Heavy Haul</option>
            <option value="oversize">Oversize</option>
            <option value="tank">Tank</option>
            <option value="van">Dry Van</option>
            <option value="reefer">Reefer</option>
            <option value="dump">Dump</option>
            <option value="car hauler">Car Hauler</option>
            <option value="other">Other</option>
          </select>
          <span className="text-xs text-muted-text mt-1 block">
            Saved with the schedule above.
          </span>
        </label>
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

      <CutTiersCard />
    </div>
  );
};

export default SettingsPage;
