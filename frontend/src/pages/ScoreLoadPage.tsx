import { useState, useEffect, useMemo, type ReactNode } from "react";
import { useLoads } from "@/hooks/useLoads";
import { useRateTargets } from "@/hooks/useRateTargets";
import { scoreLoad, VERDICT_META } from "@/lib/metrics/loadScore";
import { RATE_TIERS } from "@/lib/constants/targets";
import {
  getLoadMiles,
  getScoreRoute,
  type Place,
  type RouteGeo,
} from "@/services/routingService";
import { getLastKnownLocation } from "@/services/tripsService";
import { toInches, classifyOversize } from "@/lib/dimensions";
import MissionMap from "@/components/MissionMap";
import CityAutocomplete from "@/components/CityAutocomplete";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const rpm = (n: number | null) => (n != null ? `$${n.toFixed(2)}` : "—");

// Where the load sits on the PASS | MEH | TAKE IT | STEAL bar (0–100%).
const markerPct = (pct: number | null, allIn: number | null, be: number | null): number => {
  if (pct == null || allIn == null || be == null) return 0;
  if (allIn < be) return Math.max(0, Math.min(25, (allIn / be) * 25)); // PASS band
  if (pct < RATE_TIERS.target) return 25 + (pct / RATE_TIERS.target) * 25; // MEH
  if (pct < RATE_TIERS.strong)
    return 50 + ((pct - RATE_TIERS.target) / (RATE_TIERS.strong - RATE_TIERS.target)) * 25; // TAKE
  return 75 + Math.min(1, (pct - RATE_TIERS.strong) / 0.4) * 25; // STEAL
};

const box = (accent?: boolean) => ({
  background: "#161d2b",
  border: `1px solid ${accent ? "#85500b" : "#2a3347"}`,
  borderRadius: 9,
});

const Field = ({
  label,
  value,
  onChange,
  accent,
  suffix,
  prefix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  accent?: boolean;
  suffix?: string;
  prefix?: string;
}) => (
  <div className="flex items-center justify-between px-3 py-2.5" style={box(accent)}>
    <span className="text-xs" style={{ color: accent ? "#f5b03a" : "#9fb0c9" }}>
      {label}
    </span>
    <span className="flex items-baseline gap-1">
      {prefix && <span className="text-xs text-muted-text">{prefix}</span>}
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-24 bg-transparent text-right text-lg outline-none"
        style={{ color: accent ? "#f5b03a" : "#f4f7fb" }}
      />
      {suffix && <span className="text-[11px] text-muted-text">{suffix}</span>}
    </span>
  </div>
);

const Lbl = ({ children, accent }: { children: ReactNode; accent?: boolean }) => (
  <div className="text-[11px] mb-1" style={{ color: accent ? "#f5b03a" : "#9fb0c9" }}>
    {children}
  </div>
);

const txt = {
  background: "#161d2b",
  border: "1px solid #2a3347",
  borderRadius: 8,
  padding: "8px 10px",
  color: "#f4f7fb",
  fontSize: 14,
  width: "100%",
  outline: "none",
} as const;

// City + 2-letter state pair.
const PlaceRow = ({
  label,
  place,
  onChange,
}: {
  label: string;
  place: Place;
  onChange: (p: Place) => void;
}) => (
  <div className="flex gap-2 mb-2.5">
    <div className="flex-[3]">
      <Lbl>{label}</Lbl>
      <CityAutocomplete
        value={place.city}
        onType={(city) => onChange({ ...place, city })}
        onSelect={(city, state) => onChange({ city, state })}
        inputStyle={txt}
      />
    </div>
    <div className="flex-1">
      <Lbl>ST</Lbl>
      <input
        style={txt}
        value={place.state}
        placeholder="ST"
        maxLength={2}
        onChange={(e) => onChange({ ...place, state: e.target.value })}
      />
    </div>
  </div>
);

type FtIn = { ft: string; in: string };
const dimToIn = (d: FtIn): number | null =>
  d.ft === "" && d.in === "" ? null : toInches(Number(d.ft) || 0, Number(d.in) || 0);

// Compact feet + inches field for one dimension.
const DimField = ({
  label,
  val,
  onChange,
  accent,
}: {
  label: string;
  val: FtIn;
  onChange: (v: FtIn) => void;
  accent?: boolean;
}) => (
  <div className="flex-1">
    <Lbl accent={accent}>{label}</Lbl>
    <div className="flex items-center px-2 py-2" style={box(accent)}>
      <input
        type="number"
        inputMode="numeric"
        value={val.ft}
        placeholder="0"
        onChange={(e) => onChange({ ...val, ft: e.target.value })}
        className="w-7 bg-transparent text-right outline-none"
        style={{ color: "#f4f7fb", fontSize: 13 }}
      />
      <span className="text-[11px] text-muted-text mx-0.5">'</span>
      <input
        type="number"
        inputMode="numeric"
        value={val.in}
        placeholder="0"
        onChange={(e) => onChange({ ...val, in: e.target.value })}
        className="w-7 bg-transparent text-right outline-none"
        style={{ color: "#f4f7fb", fontSize: 13 }}
      />
      <span className="text-[11px] text-muted-text ml-0.5">"</span>
    </div>
  </div>
);

const ScoreLoadPage = () => {
  const { loads } = useLoads(0);
  const targets = useRateTargets(loads);

  const [rate, setRate] = useState("");
  const [truckNow, setTruckNow] = useState<Place>({ city: "", state: "" });
  const [pickup, setPickup] = useState<Place>({ city: "", state: "" });
  const [delivery, setDelivery] = useState<Place>({ city: "", state: "" });
  const [wt, setWt] = useState("");
  const [len, setLen] = useState<FtIn>({ ft: "", in: "" });
  const [wid, setWid] = useState<FtIn>({ ft: "", in: "" });
  const [hgt, setHgt] = useState<FtIn>({ ft: "", in: "" });
  const [loaded, setLoaded] = useState("");
  const [deadhead, setDeadhead] = useState("");
  const [routing, setRouting] = useState(false);
  const [routeErr, setRouteErr] = useState(false);
  const [route, setRoute] = useState<RouteGeo | null>(null);

  // Prefill "Truck now" (the deadhead origin) with the truck's last-known
  // location. Non-fatal — no data just leaves it blank to fill by hand.
  useEffect(() => {
    let active = true;
    getLastKnownLocation().then((loc) => {
      if (active && loc && (loc.city || loc.state))
        setTruckNow({ city: loc.city ?? "", state: loc.state ?? "" });
    });
    return () => {
      active = false;
    };
  }, []);

  const dims = useMemo(
    () => ({
      widthIn: dimToIn(wid),
      heightIn: dimToIn(hgt),
      lengthIn: dimToIn(len),
      grossWeightLb: wt === "" ? null : Number(wt) || null,
    }),
    [wid, hgt, len, wt],
  );
  const dimsKey = JSON.stringify(dims);
  const anyDim =
    dims.widthIn != null ||
    dims.heightIn != null ||
    dims.lengthIn != null ||
    dims.grossWeightLb != null;
  const oversize = useMemo(() => classifyOversize(dims), [dims]);

  const pickupReady = !!(pickup.city && pickup.state);
  const deliveryReady = !!(delivery.city && delivery.state);

  // Auto-route once pickup + delivery are both complete. Debounced so we hit HERE
  // once the typing settles, not per keystroke. Re-runs when the route or the
  // dims change; a manual edit to the mile fields doesn't (they're not deps), so
  // an override sticks until the route itself changes.
  useEffect(() => {
    if (!pickupReady || !deliveryReady) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setRouting(true);
      setRouteErr(false);
      const res = await getLoadMiles({
        truckNow: truckNow.city && truckNow.state ? truckNow : null,
        pickup,
        delivery,
        dims: anyDim ? dims : undefined,
      });
      if (cancelled) return;
      setRouting(false);
      if (res.loadedMiles == null && res.deadheadMiles == null) {
        setRouteErr(true);
        setRoute(null);
        return;
      }
      if (res.loadedMiles != null) setLoaded(String(res.loadedMiles));
      if (res.deadheadMiles != null) setDeadhead(String(res.deadheadMiles));
      // The mission map for what was just entered (haul + deadhead leg).
      getScoreRoute({
        truckNow: truckNow.city && truckNow.state ? truckNow : null,
        pickup,
        delivery,
      }).then((r) => {
        if (!cancelled) setRoute(r);
      });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup.city, pickup.state, delivery.city, delivery.state, truckNow.city, truckNow.state, dimsKey]);

  const entered = rate !== "" && loaded !== "";
  const score = scoreLoad(
    {
      rate: Number(rate),
      loadedMiles: Number(loaded),
      deadheadMiles: Number(deadhead),
    },
    {
      costPerDrivenMile: targets.basis.costPerTotalMile,
      payTake: targets.basis.payTake,
    },
  );
  const meta = score.verdict ? VERDICT_META[score.verdict] : null;

  const routeNote = routing
    ? "routing…"
    : routeErr
      ? "couldn't route — type the miles in"
      : loaded
        ? "routed · edit to override"
        : "enter pickup + delivery to route";

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <div
        className="mx-auto"
        style={{ maxWidth: 420, background: "#10151f", border: "1px solid #2a3347", borderRadius: 16, padding: 18 }}
      >
        <div className="text-[17px] font-semibold uppercase tracking-wide" style={{ color: "#f4f7fb" }}>
          Score a Load
        </div>
        <div className="text-[11px] text-muted-text mt-0.5 mb-3.5">Punch it in at the phone.</div>

        <div className="mb-2.5">
          <Field label="Rate" value={rate} onChange={setRate} prefix="$" />
        </div>

        <div
          className="flex items-center gap-2 px-3 py-2 mb-3"
          style={{ background: "#141b28", border: "1px solid #24304a", borderRadius: 9 }}
        >
          <span className="text-[11px] text-muted-text">Truck now</span>
          <input
            className="flex-[3] bg-transparent outline-none text-sm"
            style={{ color: "#f4f7fb" }}
            value={truckNow.city}
            placeholder="last stop"
            onChange={(e) => setTruckNow({ ...truckNow, city: e.target.value })}
          />
          <input
            className="w-8 bg-transparent outline-none text-sm text-right"
            style={{ color: "#f4f7fb" }}
            value={truckNow.state}
            placeholder="ST"
            maxLength={2}
            onChange={(e) => setTruckNow({ ...truckNow, state: e.target.value })}
          />
        </div>

        <PlaceRow label="Pickup" place={pickup} onChange={setPickup} />
        <PlaceRow label="Delivery" place={delivery} onChange={setDelivery} />

        <div className="text-[10px] uppercase tracking-wide mt-1 mb-1.5" style={{ color: "#5f6b80" }}>
          Load size <span className="normal-case" style={{ color: "#4a5566" }}>— leave blank if legal</span>
        </div>
        <div className="mb-2">
          <Field label="Gross wt" value={wt} onChange={setWt} suffix="lb" />
        </div>
        <div className="flex gap-2 mb-3">
          <DimField label="Length" val={len} onChange={setLen} />
          <DimField label="Width" val={wid} onChange={setWid} accent={oversize.reasons.some((r) => r.startsWith("width"))} />
          <DimField label="Height" val={hgt} onChange={setHgt} />
        </div>

        {anyDim &&
          (oversize.oversize ? (
            <div
              className="flex items-start gap-2 px-3 py-2 mb-3"
              style={{ background: "#241a06", border: "1px solid #85500b", borderRadius: 9 }}
            >
              <span className="text-sm font-semibold tracking-wide" style={{ color: "#f5b03a" }}>
                OVERSIZE
              </span>
              <span className="text-[11px] mt-0.5" style={{ color: "#c99a52" }}>
                {oversize.reasons.join(" · ")}
              </span>
            </div>
          ) : (
            <div
              className="flex items-center gap-2 px-3 py-2 mb-3"
              style={{ background: "#0f2018", border: "1px solid #1a5c3a", borderRadius: 9 }}
            >
              <span className="text-sm font-semibold tracking-wide" style={{ color: "#4ade80" }}>
                LEGAL
              </span>
              <span className="text-[11px]" style={{ color: "#5f8a6e" }}>
                within legal limits — no permit
              </span>
            </div>
          ))}

        <div className="text-[10px] mb-1" style={{ color: routeErr ? "#e8940a" : "#5f6b80" }}>
          {routeNote}
        </div>
        <div className="flex gap-2.5 mb-1">
          <div className="flex-1">
            <Field label="Loaded" value={loaded} onChange={setLoaded} suffix="mi" />
          </div>
          <div className="flex-1">
            <Field label="Deadhead" value={deadhead} onChange={setDeadhead} accent suffix="mi" />
          </div>
        </div>

        {route?.pickup && route?.delivery && (
          <div className="mt-2.5 mb-1 rounded-[9px] overflow-hidden" style={{ border: "1px solid #2a3347" }}>
            <MissionMap
              pickup={route.pickup}
              delivery={route.delivery}
              deadhead={route.deadhead}
              loadedMiles={loaded === "" ? null : Number(loaded)}
              deadheadMiles={deadhead === "" ? null : Number(deadhead)}
              height={440}
            />
          </div>
        )}

        {!targets.ready ? (
          <p className="text-xs text-muted-text mt-4 text-center">
            Upload a P&amp;L on the Expenses page to calibrate your break-even, then loads can be scored.
          </p>
        ) : !entered ? (
          <p className="text-xs text-muted-text mt-6 text-center">
            Enter a rate and route to get a verdict.
          </p>
        ) : (
          <>
            <div className="text-center mt-4 mb-1.5">
              <div
                className="inline-block font-bold"
                style={{
                  transform: "rotate(-7deg)",
                  border: `4px solid ${meta!.fg}`,
                  color: meta!.fg,
                  borderRadius: 12,
                  padding: "6px 22px",
                  fontSize: 34,
                  letterSpacing: 3,
                  fontFamily: "Georgia, serif",
                }}
              >
                {meta!.label}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3.5">
              <div className="rounded-[9px] py-2 text-center" style={{ background: "#141b28" }}>
                <div className="text-[9px] text-muted-text tracking-wide">ALL-IN / MI</div>
                <div className="text-lg font-semibold" style={{ color: meta!.fg }}>{rpm(score.allInRpm)}</div>
                <div className="text-[9px]" style={{ color: "#5f6b80" }}>{score.drivenMiles.toLocaleString("en-US")} mi driven</div>
              </div>
              <div className="rounded-[9px] py-2 text-center" style={{ background: "#141b28" }}>
                <div className="text-[9px] text-muted-text tracking-wide">BREAK-EVEN</div>
                <div className="text-lg font-semibold" style={{ color: "#cdd8e8" }}>{rpm(score.breakevenRpm)}</div>
                <div className="text-[9px]" style={{ color: "#5f6b80" }}>
                  {score.pctOverBreakeven != null
                    ? `${score.pctOverBreakeven >= 0 ? "+" : ""}${Math.round(score.pctOverBreakeven * 100)}%`
                    : ""}
                </div>
              </div>
              <div className="rounded-[9px] py-2 text-center" style={{ background: "#141b28" }}>
                <div className="text-[9px] text-muted-text tracking-wide">PROFIT</div>
                <div className="text-lg font-semibold" style={{ color: (score.profit ?? 0) >= 0 ? "#4ade80" : "#f87171" }}>
                  {score.profit != null ? money(score.profit) : "—"}
                </div>
                <div className="text-[9px]" style={{ color: "#5f6b80" }}>after the cut</div>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-[9px] text-muted-text tracking-wide mb-1.5">WHERE IT LANDS</div>
              <div className="flex rounded-[5px] overflow-hidden relative" style={{ height: 10 }}>
                <div style={{ flex: 1, background: "#3a1a1a" }} />
                <div style={{ flex: 1, background: "#3a2a0a" }} />
                <div style={{ flex: 1, background: "#1a3a2a" }} />
                <div style={{ flex: 1, background: "#3a300a" }} />
                <div
                  style={{
                    position: "absolute",
                    left: `${markerPct(score.pctOverBreakeven, score.allInRpm, score.breakevenRpm)}%`,
                    top: -3,
                    width: 2,
                    height: 16,
                    background: "#f4f7fb",
                  }}
                />
              </div>
              <div className="flex justify-between text-[8.5px] mt-1">
                <span style={{ color: "#f87171" }}>PASS</span>
                <span style={{ color: "#e8940a" }}>MEH</span>
                <span style={{ color: "#4ade80" }}>TAKE IT</span>
                <span style={{ color: "#fbbf24" }}>STEAL</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ScoreLoadPage;
