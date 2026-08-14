import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useLoads } from "@/hooks/useLoads";
import { useAgents } from "@/hooks/useAgents";
import { useRateTargets } from "@/hooks/useRateTargets";
import { scoreLoad, counterRates, VERDICT_META } from "@/lib/metrics/loadScore";
import { buildAgentScorecards } from "@/lib/metrics/agentScorecard";
import { playSfx } from "@/lib/sfx";
import { RATE_TIERS, type RateTiers } from "@/lib/constants/targets";
import { getLoadMiles, type Place } from "@/services/routingService";
import { getLastKnownLocation } from "@/services/tripsService";
import { toInches, classifyOversize } from "@/lib/dimensions";
import CityAutocomplete from "@/components/CityAutocomplete";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ForgedPlate, Well } from "@/components/ui/ForgedPlate";
import { matchAgents, agentLabel, agentCode, agentFullName } from "@/lib/agentMatch";
import type { Agent } from "@/types/agent";
import { money, rpm as fmtRpm } from "@/lib/format";

// Where the load sits on the SCRAP | THIN | SOLID | PRIME bar (0–100%).
const markerPct = (
  pct: number | null,
  allIn: number | null,
  be: number | null,
  tiers: RateTiers = RATE_TIERS,
): number => {
  if (pct == null || allIn == null || be == null) return 0;
  if (allIn < be) return Math.max(0, Math.min(25, (allIn / be) * 25)); // SCRAP band
  if (pct < tiers.target) return 25 + (pct / tiers.target) * 25; // THIN
  if (pct < tiers.strong)
    return 50 + ((pct - tiers.target) / (tiers.strong - tiers.target)) * 25; // SOLID
  return 75 + Math.min(1, (pct - tiers.strong) / 0.4) * 25; // PRIME
};

// ---- forge inputs ----
const Lbl = ({ children, accent }: { children: ReactNode; accent?: boolean }) => (
  <div
    className={`font-condensed uppercase tracking-widest text-[10px] mb-1 ${accent ? "text-amber" : "text-faint"}`}
  >
    {children}
  </div>
);

// A labeled number field on a well (rate, weight, miles).
const NumField = ({
  label,
  value,
  onChange,
  prefix,
  suffix,
  accent,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  accent?: boolean;
}) => (
  <div
    className={`flex items-center justify-between px-3 py-2.5 rounded-lg bg-well border ${accent ? "border-amber/50" : "border-hairline"}`}
  >
    <span className={`font-condensed text-[13px] ${accent ? "text-amber" : "text-dim"}`}>{label}</span>
    <span className="flex items-baseline gap-1">
      {prefix && <span className="text-[12px] text-faint">{prefix}</span>}
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-24 bg-transparent text-right text-lg outline-none font-display text-ink"
      />
      {suffix && <span className="text-[11px] text-faint">{suffix}</span>}
    </span>
  </div>
);

const cityInputCls =
  "w-full bg-well border border-hairline rounded-lg px-2.5 py-2 text-[14px] text-ink outline-none focus:border-amber/60";

const PlaceRow = ({
  label,
  place,
  onChange,
}: {
  label: string;
  place: Place;
  onChange: (p: Place) => void;
}) => (
  <div className="flex gap-2 mb-2">
    <div className="flex-[3]">
      <Lbl>{label}</Lbl>
      <CityAutocomplete
        value={place.city}
        onType={(city) => onChange({ ...place, city })}
        onSelect={(city, state) => onChange({ city, state })}
        inputClassName={cityInputCls}
      />
    </div>
    <div className="flex-1">
      <Lbl>ST</Lbl>
      <input
        className={cityInputCls + " text-center uppercase"}
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
    <div
      className={`flex items-center px-2 py-2 rounded-lg bg-well border ${accent ? "border-amber/60" : "border-hairline"}`}
    >
      <input
        type="number"
        inputMode="numeric"
        value={val.ft}
        placeholder="0"
        onChange={(e) => onChange({ ...val, ft: e.target.value })}
        className="w-7 bg-transparent text-right outline-none text-ink text-[13px]"
      />
      <span className="text-[11px] text-faint mx-0.5">'</span>
      <input
        type="number"
        inputMode="numeric"
        value={val.in}
        placeholder="0"
        onChange={(e) => onChange({ ...val, in: e.target.value })}
        className="w-7 bg-transparent text-right outline-none text-ink text-[13px]"
      />
      <span className="text-[11px] text-faint ml-0.5">"</span>
    </div>
  </div>
);

// The agent field: match your agents by 3-letter code OR name, pick the person.
// Anything that matches nothing flags a new agent — and nothing is saved here.
const AgentField = ({
  agents,
  query,
  onQuery,
  selected,
  onPick,
}: {
  agents: Agent[];
  query: string;
  onQuery: (q: string) => void;
  selected: Agent | null;
  onPick: (a: Agent | null) => void;
}) => {
  const [open, setOpen] = useState(false);
  const focused = useRef(false);
  const matches = useMemo(() => matchAgents(agents, query), [agents, query]);
  const showList = open && !selected && matches.length > 0;

  return (
    <div className="relative">
      <input
        value={query}
        placeholder="EWT, or a name"
        autoComplete="off"
        className={cityInputCls + (selected ? " text-amber" : "")}
        onChange={(e) => {
          onPick(null); // typing re-opens the search
          onQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          focused.current = true;
          if (!selected && matches.length) setOpen(true);
        }}
        onBlur={() => {
          focused.current = false;
          setTimeout(() => setOpen(false), 150);
        }}
        role="combobox"
        aria-expanded={showList}
      />
      {showList && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 p-1 rounded-lg bg-panel border border-hairline max-h-56 overflow-y-auto"
          style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}
        >
          {matches.map((a) => (
            <li
              key={a.agent_id}
              role="option"
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(a);
                onQuery(agentLabel(a));
                setOpen(false);
              }}
              className="flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer text-[14px] text-ink hover:bg-well"
            >
              <span className="font-condensed font-semibold text-amber">{agentCode(a) || "—"}</span>
              <span className="text-dim">·</span>
              <span>{agentFullName(a)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const ScoreLoadPage = () => {
  const { loads } = useLoads(0);
  const { agents } = useAgents();
  const targets = useRateTargets(loads);
  const now = useMemo(() => new Date(), []);
  const scorecards = useMemo(
    () => buildAgentScorecards(agents ?? [], loads ?? [], now),
    [agents, loads, now],
  );

  const [rate, setRate] = useState("");
  const [truckNow, setTruckNow] = useState<Place>({ city: "", state: "" });
  const [pickup, setPickup] = useState<Place>({ city: "", state: "" });
  const [delivery, setDelivery] = useState<Place>({ city: "", state: "" });
  const [agentQuery, setAgentQuery] = useState("");
  const [agent, setAgent] = useState<Agent | null>(null);
  const [wt, setWt] = useState("");
  const [len, setLen] = useState<FtIn>({ ft: "", in: "" });
  const [wid, setWid] = useState<FtIn>({ ft: "", in: "" });
  const [hgt, setHgt] = useState<FtIn>({ ft: "", in: "" });
  const [loaded, setLoaded] = useState("");
  const [deadhead, setDeadhead] = useState("");
  const [hazmat, setHazmat] = useState(false);
  const [routing, setRouting] = useState(false);
  const [routeErr, setRouteErr] = useState(false);
  const [toll, setToll] = useState<number | null>(null);

  // Prefill "Truck now" with the truck's last-known location. Non-fatal.
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
  // Specialized freight (oversize by dims/weight, OR hazmat) is held to the
  // higher tier set; everything else uses the standard set.
  const specialized = oversize.oversize || hazmat;
  const activeTiers = specialized ? targets.specTiers : targets.tiers;

  const pickupReady = !!(pickup.city && pickup.state);
  const deliveryReady = !!(delivery.city && delivery.state);

  // Auto-route once pickup + delivery are complete (debounced). Fills loaded +
  // deadhead + tolls; a manual edit to the mile fields sticks until the route
  // itself changes.
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
        setToll(null);
        return;
      }
      if (res.loadedMiles != null) setLoaded(String(res.loadedMiles));
      if (res.deadheadMiles != null) setDeadhead(String(res.deadheadMiles));
      setToll(res.tollUsd);
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
    activeTiers,
  );
  const meta = score.verdict ? VERDICT_META[score.verdict] : null;
  useEffect(() => {
    if (score.verdict === "steal") playSfx("kaching");
  }, [score.verdict]);

  const belowTarget = score.verdict === "pass" || score.verdict === "meh";
  const counter =
    belowTarget ? counterRates(score.breakevenRpm, score.drivenMiles, activeTiers) : null;

  // Deadhead diagnosis: how much of the run is empty, and whether the freight
  // itself is fine (the rate the load pays on its own loaded miles).
  const deadMi = Number(deadhead) || 0;
  const deadShare = score.drivenMiles > 0 ? deadMi / score.drivenMiles : 0;
  const freightDrag = deadShare >= 0.12 && belowTarget;

  // Agent factor: an existing agent carries history; an unmatched entry is new.
  const isNewAgent = !agent && agentQuery.trim().length >= 2 && matchAgents(agents ?? [], agentQuery).length === 0;
  const agentCard = agent ? scorecards.get(agent.agent_id) : undefined;

  const routeNote = routing
    ? "routing…"
    : routeErr
      ? "couldn't route — type the miles in"
      : loaded
        ? "routed · edit to override"
        : "enter pickup + delivery to route";

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center gap-3 mb-4">
        <SidebarTrigger />
        <div>
          <p className="font-condensed uppercase tracking-widest text-[11px] text-amber leading-none">
            Take it or leave it
          </p>
          <h1 className="font-display text-[30px] text-ink leading-none mt-1">SCORE A LOAD</h1>
        </div>
      </div>

      <div className="ds2-board mx-auto p-4 sm:p-5" style={{ maxWidth: 440 }}>
        <NumField label="Rate" value={rate} onChange={setRate} prefix="$" />

        <p className="font-condensed uppercase tracking-widest text-[10px] text-faint mt-4 mb-1.5">
          Route <span className="normal-case tracking-normal text-[10px]" style={{ color: "#4a5566" }}>— city autocompletes</span>
        </p>
        <PlaceRow label="Truck now" place={truckNow} onChange={setTruckNow} />
        <PlaceRow label="Pickup" place={pickup} onChange={setPickup} />
        <PlaceRow label="Delivery" place={delivery} onChange={setDelivery} />

        <div className="mt-3">
          <Lbl accent>Agent</Lbl>
          <AgentField
            agents={agents ?? []}
            query={agentQuery}
            onQuery={setAgentQuery}
            selected={agent}
            onPick={setAgent}
          />
          {isNewAgent && (
            <div className="mt-1.5 flex items-center gap-2">
              <span className="font-forge text-[11px] tracking-wider px-2 py-0.5 rounded" style={{ background: "rgba(53,160,140,.15)", color: "#5dcaa5" }}>
                NEW AGENT
              </span>
              <span className="text-[11px] text-dim">no history yet · not saved until you book</span>
            </div>
          )}
        </div>

        <p className="font-condensed uppercase tracking-widest text-[10px] text-faint mt-4 mb-1.5">
          Load size <span className="normal-case tracking-normal" style={{ color: "#4a5566" }}>— leave blank if legal</span>
        </p>
        <div className="mb-2">
          <NumField label="Gross wt" value={wt} onChange={setWt} suffix="lb" />
        </div>
        <div className="flex gap-2 mb-2.5">
          <DimField label="Length" val={len} onChange={setLen} />
          <DimField label="Width" val={wid} onChange={setWid} accent={oversize.reasons.some((r) => r.startsWith("width"))} />
          <DimField label="Height" val={hgt} onChange={setHgt} />
        </div>

        <label
          className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer select-none bg-well border ${hazmat ? "border-amber/60" : "border-hairline"}`}
        >
          <input
            type="checkbox"
            checked={hazmat}
            onChange={(e) => setHazmat(e.target.checked)}
            className="accent-[#e8940a]"
          />
          <span className="text-[12.5px] text-ink">Hazmat</span>
          <span className="ml-auto text-[10px] text-faint">premium · specialized tiers</span>
        </label>

        {anyDim &&
          (oversize.oversize ? (
            <div className="flex items-start gap-2 px-3 py-2 mt-2.5 rounded-lg" style={{ background: "#241a06", border: "1px solid #85500b" }}>
              <span className="font-forge text-[15px] tracking-wide text-amber">OVERSIZE</span>
              <span className="text-[11px] mt-0.5 text-dim">{oversize.reasons.join(" · ")} → specialized tiers</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 mt-2.5 rounded-lg" style={{ background: "#0f2018", border: "1px solid #1a5c3a" }}>
              <span className="font-forge text-[15px] tracking-wide" style={{ color: "#5dcaa5" }}>LEGAL</span>
              <span className="text-[11px] text-dim">standard flatbed → standard tiers</span>
            </div>
          ))}

        <div className="text-[10px] mt-3 mb-1" style={{ color: routeErr ? "#e8940a" : "#5a6880" }}>
          {routeNote}
        </div>
        <div className="flex gap-2.5">
          <div className="flex-1">
            <NumField label="Loaded" value={loaded} onChange={setLoaded} suffix="mi" />
          </div>
          <div className="flex-1">
            <NumField label="Deadhead" value={deadhead} onChange={setDeadhead} accent suffix="mi" />
          </div>
        </div>

        {toll != null && (
          <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg bg-well">
            <span className="text-[13px] text-ink">
              Est. tolls <span className="font-semibold">≈ {money(toll)}</span>
            </span>
            <span className="ml-auto text-[10px] text-faint">bill as accessorial · Landstar pays 100%</span>
          </div>
        )}

        {!targets.ready ? (
          <p className="text-xs text-dim mt-5 text-center">
            Upload a P&amp;L on the Expenses page to calibrate your break-even, then loads can be scored.
          </p>
        ) : !entered || !meta ? (
          <p className="text-xs text-dim mt-6 text-center">Enter a rate and real miles to get a verdict.</p>
        ) : (
          <>
            {/* verdict — the one forged plate */}
            <ForgedPlate chamfer className="p-4 mt-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex-shrink-0">
                  <Lbl accent>Verdict</Lbl>
                  <div className="font-forge leading-none" style={{ fontSize: 44, color: meta.fg }}>
                    {meta.label}
                  </div>
                </div>
                <div className="flex-1 min-w-[150px]">
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-[28px] text-ink">{fmtRpm(score.allInRpm)}</span>
                    <span className="font-condensed text-[12px] text-dim">/ driven mi (all-in)</span>
                  </div>
                  <div className="font-condensed text-[12px] text-dim mt-0.5">
                    {score.pctOverBreakeven != null && (
                      <>
                        {score.pctOverBreakeven >= 0 ? "+" : ""}
                        {Math.round(score.pctOverBreakeven * 100)}% over break-even ·{" "}
                      </>
                    )}
                    <span style={{ color: specialized ? "#f5b03a" : "#5dcaa5" }}>
                      {specialized ? "Specialized" : "Standard"}
                    </span>{" "}
                    tiers, target +{Math.round(activeTiers.target * 100)}%
                  </div>
                </div>
              </div>
            </ForgedPlate>

            {/* deadhead diagnosis */}
            <div className="ds2-board p-4 mt-3">
              <Lbl>Why it's {meta.label.toLowerCase()} — freight vs deadhead</Lbl>
              <div className="grid grid-cols-2 gap-2.5 mt-2 mb-2.5">
                <Well className="px-3 py-2">
                  <div className="font-condensed text-[11px]" style={{ color: "#5dcaa5" }}>FREIGHT</div>
                  <div className="font-display text-[20px] text-ink">
                    {fmtRpm(score.loadedRpm)}<span className="font-condensed text-[11px] text-faint"> /loaded</span>
                  </div>
                </Well>
                <Well className="px-3 py-2">
                  <div className="font-condensed text-[11px] text-amber">DEADHEAD</div>
                  <div className="font-display text-[20px] text-ink">
                    {deadMi.toLocaleString("en-US")}<span className="font-condensed text-[11px] text-faint"> mi · {Math.round(deadShare * 100)}%</span>
                  </div>
                </Well>
              </div>
              <p className="text-[12.5px] text-dim">
                {freightDrag
                  ? "Good freight — the deadhead is the knock, not the load. Weigh the reposition, or lean on the agent for the backhaul."
                  : deadShare < 0.05
                    ? "Deadhead's slim — this is close to what the freight itself pays."
                    : "Freight rate and all-in are close; deadhead isn't the story here."}
              </p>
            </div>

            {/* agent standing */}
            {agent && (
              <div className="ds2-board p-3.5 mt-3 flex items-center gap-3">
                <span className="text-amber text-[15px]">◆</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <Lbl>Agent</Lbl>
                    <Link to={`/agents/${agent.agent_id}`} className="font-condensed text-[15px] text-amber hover:text-hot">
                      {agentLabel(agent)}
                    </Link>
                  </div>
                  {agentCard && agentCard.loadCount > 0 ? (
                    <div className="text-[12.5px] text-dim mt-0.5">
                      {agentCard.loadCount} load{agentCard.loadCount === 1 ? "" : "s"} together ·{" "}
                      {agentCard.medianRpm != null ? `${fmtRpm(agentCard.medianRpm)}/mi avg · ` : ""}
                      {agentCard.moneyLostLoads > 0 ? "detention owed" : "low dwell"}
                      {agentCard.daysSince != null ? ` · last ${agentCard.daysSince}d ago` : ""}
                    </div>
                  ) : (
                    <div className="text-[12.5px] text-dim mt-0.5">No delivered history yet with this agent.</div>
                  )}
                </div>
              </div>
            )}
            {isNewAgent && (
              <div className="ds2-board p-3.5 mt-3 text-[12.5px] text-dim">
                <span className="font-forge text-[12px] tracking-wider mr-2" style={{ color: "#5dcaa5" }}>NEW AGENT</span>
                No history yet — the rate and route still score; the relationship builds once you book.
              </div>
            )}

            {/* where it lands */}
            <div className="mt-4">
              <Lbl>Where it lands</Lbl>
              <div className="flex rounded-[5px] overflow-hidden relative" style={{ height: 10 }}>
                <div style={{ flex: 1, background: "#2a1414" }} />
                <div style={{ flex: 1, background: "#2a2110" }} />
                <div style={{ flex: 1, background: "#12261f" }} />
                <div style={{ flex: 1, background: "#2a2410" }} />
                <div
                  style={{
                    position: "absolute",
                    left: `${markerPct(score.pctOverBreakeven, score.allInRpm, score.breakevenRpm, activeTiers)}%`,
                    top: -3,
                    width: 2,
                    height: 16,
                    background: "#e6ecf7",
                  }}
                />
              </div>
              <div className="flex justify-between text-[8.5px] font-condensed tracking-wide mt-1">
                <span style={{ color: "#e24b4a" }}>SCRAP</span>
                <span style={{ color: "#f5b03a" }}>THIN</span>
                <span style={{ color: "#5dcaa5" }}>SOLID</span>
                <span style={{ color: "#ffcf7a" }}>PRIME</span>
              </div>
            </div>

            {counter && (
              <div className="ds2-board p-3 mt-4">
                <Lbl>What to ask the agent</Lbl>
                <div className="flex gap-2 mt-2">
                  <Well className="flex-1 text-center py-2">
                    <div className="text-[9px] font-condensed" style={{ color: "#e24b4a" }}>FLOOR</div>
                    <div className="font-display text-[17px] text-ink">{money(counter.floor)}</div>
                    <div className="text-[8.5px] text-faint">break-even</div>
                  </Well>
                  <Well className="flex-1 text-center py-2" style={{ borderColor: "#1a5c3a" }}>
                    <div className="text-[9px] font-condensed" style={{ color: "#5dcaa5" }}>SOLID</div>
                    <div className="font-display text-[17px]" style={{ color: "#5dcaa5" }}>{money(counter.take)}</div>
                    <div className="text-[8.5px] text-faint">fair</div>
                  </Well>
                  <Well className="flex-1 text-center py-2" style={{ borderColor: "#6b5410" }}>
                    <div className="text-[9px] font-condensed" style={{ color: "#ffcf7a" }}>PRIME</div>
                    <div className="font-display text-[17px]" style={{ color: "#ffcf7a" }}>{money(counter.steal)}</div>
                    <div className="text-[8.5px] text-faint">open here</div>
                  </Well>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ScoreLoadPage;
