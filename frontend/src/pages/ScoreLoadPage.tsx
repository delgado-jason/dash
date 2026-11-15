import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useLoads } from "@/hooks/useLoads";
import { useTrips } from "@/hooks/useTrips";
import { windowLoads, DEFAULT_WINDOW } from "@/lib/metrics/marketLedger";
import { useAgents } from "@/hooks/useAgents";
import { useRateTargets } from "@/hooks/useRateTargets";
import { scoreLoad, knownNumber, verdictAtLeast, VERDICT_META, VERDICT_ORDER } from "@/lib/metrics/loadScore";
import { quoteTable, quoteSentence } from "@/lib/metrics/quoteTable";
import { buildAgentScorecards } from "@/lib/metrics/agentScorecard";
import { emptyNextAnchor } from "@/lib/metrics/foreman";
import { useCityCoords } from "@/hooks/useCityCoords";
import {
  destinationFactor,
  theCall,
  type MarketGrade, gradeCostsOf } from "@/lib/metrics/marketFactor";
import { RATE_TIERS, marginAtMarkup, type RateTiers } from "@/lib/constants/targets";
import { getLoadMiles, type Place } from "@/services/routingService";
import { getLastKnownLocation } from "@/services/tripsService";
import { standingOf } from "@/lib/agents/standing";
import { getAgent } from "@/services/agentService";
import { DeskBrief, type DeskNotes } from "@/components/scorer/DeskBrief";
import { QuoteTablePanel } from "@/components/scorer/QuoteTablePanel";
import {
  toInches,
  classifyOversize,
  freightCeilingLb,
  grossFromFreight,
} from "@/lib/dimensions";
import {
  passThroughCost,
  passThroughAsk,
  grossUpPremium,
  rateNetOfPassThrough,
} from "@/lib/metrics/passThrough";
import CityAutocomplete from "@/components/CityAutocomplete";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Panel } from "@/components/ui/Panel";
import { Well } from "@/components/ui/Well";
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
  // FIVE bands of 20, one per verdict, in VERDICT_ORDER. It was four of 25 and
  // the middle one spanned break-even → target, so the needle sat in the "THIN"
  // stripe while the headline said PROFITABLE (2026-11-12). A gauge that
  // disagrees with the word above it is worse than no gauge.
  const W = 100 / VERDICT_ORDER.length;
  const seg = (i: number, frac: number) => i * W + Math.max(0, Math.min(1, frac)) * W;
  if (allIn < be) return seg(0, allIn / be);
  if (pct < tiers.minimum) return seg(1, pct / tiers.minimum);
  if (pct < tiers.target)
    return seg(2, (pct - tiers.minimum) / (tiers.target - tiers.minimum));
  if (pct < tiers.prime)
    return seg(3, (pct - tiers.target) / (tiers.prime - tiers.target));
  return seg(4, (pct - tiers.prime) / 0.4);
};

// Destination market grade → the grade word.
const GRADE_META: Record<MarketGrade, { label: string; color: string }> = {
  strong: { label: "STRONG", color: "var(--color-cat2)" },
  fair: { label: "FAIR", color: "var(--color-dim)" },
  soft: { label: "SOFT", color: "var(--color-amber)" },
  thin: { label: "THIN", color: "var(--color-faint)" },
};

// One of the four result tiles — a figure with its question above and its
// basis below, on the one flat surface.
const Tile = ({ h, n, p }: { h: string; n: string; p: string }) => (
  <div className="bg-panel px-4 py-3">
    <p className="ds2-label">{h}</p>
    <p className="font-condensed font-semibold tabular-nums text-[26px] leading-[1.1] text-ink mt-1">{n}</p>
    <p className="text-[12.5px] text-dim mt-0.5">{p}</p>
  </div>
);

// ---- inputs ----
const Lbl = ({ children, accent }: { children: ReactNode; accent?: boolean }) => (
  <div
    className={`font-condensed uppercase tracking-widest text-[11px] mb-1 ${accent ? "text-amber" : "text-faint"}`}
  >
    {children}
  </div>
);

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
    <span className={`font-condensed text-[14px] ${accent ? "text-amber" : "text-dim"}`}>{label}</span>
    <span className="flex items-baseline gap-1">
      {prefix && <span className="text-[13px] text-faint">{prefix}</span>}
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-24 bg-transparent text-right text-lg outline-none font-condensed font-semibold tabular-nums text-ink"
      />
      {suffix && <span className="text-[12px] text-faint">{suffix}</span>}
    </span>
  </div>
);

const cityInputCls =
  "w-full bg-well border border-hairline rounded-lg px-2.5 py-2 text-[15px] text-ink outline-none focus:border-amber/60";

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
        className="w-7 bg-transparent text-right outline-none text-ink text-[14px]"
      />
      <span className="text-[12px] text-faint mx-0.5">'</span>
      <input
        type="number"
        inputMode="numeric"
        value={val.in}
        placeholder="0"
        onChange={(e) => onChange({ ...val, in: e.target.value })}
        className="w-7 bg-transparent text-right outline-none text-ink text-[14px]"
      />
      <span className="text-[12px] text-faint ml-0.5">"</span>
    </div>
  </div>
);

// The agent field: match by 3-letter code OR name, pick the person. Anything that
// matches nothing flags a new agent — and nothing is saved here.
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
  const matches = useMemo(() => matchAgents(agents, query), [agents, query]);
  const showList = open && !selected && matches.length > 0;

  // A code that matches exactly one desk resolves on its own — Brandie types
  // EWT and the desk fills in. A code that matches TWO (six of the 66 codes
  // carry two agents, one of them a parked desk beside an active one) stays
  // unresolved until she picks, and the score gate refuses until she has;
  // the parked one is marked in the list for exactly that moment.
  useEffect(() => {
    if (selected) return;
    const q = query.trim().toUpperCase();
    if (q.length < 2) return;
    const exact = agents.filter((a) => agentCode(a).toUpperCase() === q);
    if (exact.length === 1) {
      onPick(exact[0]);
      onQuery(agentLabel(exact[0]));
    }
  }, [query, agents, selected, onPick, onQuery]);

  return (
    <div className="relative">
      <input
        value={query}
        placeholder="EWT, or a name"
        autoComplete="off"
        className={cityInputCls + (selected ? " text-amber" : "")}
        onChange={(e) => {
          onPick(null);
          onQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (!selected && matches.length) setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        role="combobox"
        aria-expanded={showList}
      />
      {showList && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 p-1 rounded-lg bg-panel border border-hairline max-h-56 overflow-y-auto"
          style={{ boxShadow: "var(--shadow-pop)" }}
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
              className="flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer text-[15px] text-ink hover:bg-well"
            >
              <span className="font-condensed font-semibold text-amber">{agentCode(a) || "—"}</span>
              <span className="text-dim">·</span>
              <span>{agentFullName(a)}</span>
              {standingOf(a) === "parked" && (
                <span
                  className="ml-auto font-condensed font-semibold text-[11px] uppercase tracking-[.06em]"
                  style={{ color: "var(--color-status-negative-text)" }}
                >
                  parked
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const ScoreLoadPage = () => {
  const { loads } = useLoads(0);
  const { trips } = useTrips(0);
  const { agents } = useAgents();
  const targets = useRateTargets(loads);
  // The spread the blend hides — each basis month's own rate to book — so the
  // verdict names what it graded on, the way the Market page does (§7, 2026-11-04).
  const monthSpread = useMemo(() => {
    const rates = targets.basis.monthsDetail
      .filter((m) => m.costPerTotalMile != null)
      .map((m) => (m.costPerTotalMile as number) / targets.keep);
    if (rates.length < 2 || !(targets.keep > 0)) return null;
    return { lo: Math.min(...rates), hi: Math.max(...rates) };
  }, [targets.basis.monthsDetail, targets.keep]);
  const now = useMemo(() => new Date(), []);
  const scorecards = useMemo(
    () => buildAgentScorecards(agents ?? [], loads ?? [], now),
    [agents, loads, now],
  );
  const coords = useCityCoords(loads ?? []);

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
  const [deadheadUnrouted, setDeadheadUnrouted] = useState(false);
  const [hazmat, setHazmat] = useState(false);
  const [permits, setPermits] = useState("");
  const [escorts, setEscorts] = useState("");
  // A reposition is not competing with a good load, it is competing with an
  // empty trailer and a parking brake — so it gets a different ruler, not a
  // softer rung on the same one. See the beats-parking floor below.
  const [reposition, setReposition] = useState(false);
  const [routing, setRouting] = useState(false);
  const [routeErr, setRouteErr] = useState(false);
  const [toll, setToll] = useState<number | null>(null);
  const [scored, setScored] = useState(false);
  // The desk's dated notes, fetched AS THE CODE RESOLVES (GET /agents/:id
  // returns them beside the rating history). null while loading; a failed
  // fetch is said on the brief, never shown as "no notes".
  const [desk, setDesk] = useState<DeskNotes>({ notes: null, failed: false });
  const truckTouched = useRef(false);

  const setTruck = (p: Place) => {
    truckTouched.current = true;
    setTruckNow(p);
  };

  // Prefill "Truck now" with where you'll be empty NEXT — the destination of your
  // active/booked load, else your last delivery (the same anchor The Foreman uses).
  useEffect(() => {
    if (truckTouched.current) return;
    const anchor = emptyNextAnchor(loads ?? [], trips);
    if (anchor) setTruckNow({ city: anchor.city, state: anchor.state });
  }, [loads, trips]);
  // Fallback only when there's no committed/delivered load to anchor on (fuel/trips).
  useEffect(() => {
    let active = true;
    getLastKnownLocation().then((loc) => {
      if (!active || truckTouched.current) return;
      setTruckNow((cur) =>
        cur.city || cur.state ? cur : { city: loc?.city ?? "", state: loc?.state ?? "" },
      );
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!agent) {
      setDesk({ notes: null, failed: false });
      return;
    }
    let active = true;
    setDesk({ notes: null, failed: false });
    getAgent(agent.agent_id)
      .then((r) => {
        if (active) setDesk({ notes: r.notes, failed: false });
      })
      .catch(() => {
        if (active) setDesk({ notes: null, failed: true });
      });
    return () => {
      active = false;
    };
  }, [agent]);

  // THE WEIGHT BOX ASKS FOR FREIGHT NOW, not gross.
  //
  // It was labelled "Gross wt" and tested against the 80,000 legal gross, but
  // an agent says "it's a 52,000 pound load" — the freight. Jason's own records
  // agree: of 54 loads carrying a weight the max is 50,000 and none exceeds
  // 80,000, so the column always held freight. A heavy load therefore read as
  // legal and priced on the Standard ladder: 85¢ a driven mile under-asked.
  //
  // Gross is freight + what the truck scales empty, from Settings. No empty
  // weight set → NO GROSS, deliberately: a guessed tare is the original bug,
  // and the Scorer then grades exactly as it did before.
  const emptyWeightLb = targets.equipment.emptyWeightLb;
  const freightLb = wt === "" ? null : Number(wt) || null;
  const ceilingLb = freightCeilingLb(emptyWeightLb);
  const grossLb = grossFromFreight(freightLb, emptyWeightLb);

  const dims = useMemo(
    () => ({
      widthIn: dimToIn(wid),
      heightIn: dimToIn(hgt),
      lengthIn: dimToIn(len),
      grossWeightLb: grossLb,
    }),
    [wid, hgt, len, grossLb],
  );
  const dimsKey = JSON.stringify(dims);
  const anyDim =
    dims.widthIn != null ||
    dims.heightIn != null ||
    dims.lengthIn != null ||
    freightLb != null;
  const oversize = useMemo(() => classifyOversize(dims), [dims]);
  const specialized = oversize.oversize || hazmat;
  const activeTiers = specialized ? targets.specTiers : targets.tiers;

  // Permits and escorts: money you lay out and are not reimbursed for. The
  // block only exists once the load is over legal, so a plain flatbed run sees
  // the form it always saw.
  const permitted = oversize.oversize;
  const ptCost = useMemo(
    () =>
      passThroughCost({
        permitCount: permitted && permits !== "" ? Number(permits) || null : null,
        escortCount: permitted && escorts !== "" ? Number(escorts) || null : null,
        loadedMiles: loaded === "" ? null : Number(loaded) || null,
        permitCostUsd: targets.equipment.permitCostUsd,
        escortCostPerLoadedMile: targets.equipment.escortCostPerLoadedMile,
      }),
    [permitted, permits, escorts, loaded, targets.equipment],
  );
  // What the load must carry to leave you whole — cost ÷ your linehaul take,
  // because Landstar pays the deducted charge back at the same 73% split (see
  // lib/metrics/passThrough.ts for the settlement it was read off).
  const ptAsk = passThroughAsk(ptCost.total, targets.linehaulTake) ?? ptCost.total;
  const ptPremium = grossUpPremium(ptCost.total, targets.linehaulTake);
  // The offer, less the money that passes straight through you. THIS is what
  // gets graded: $7,800 over 750 driven reads $10.40 a mile, and with $3,452 of
  // escorts inside it what actually pays you is $5.80.
  const rateNum = rate === "" ? null : Number(rate) || null;
  const gradedRate = rateNetOfPassThrough(rateNum, ptAsk);
  // THE OFFER DOES NOT COVER ITS OWN PERMIT BILL. rateNetOfPassThrough clamps
  // at zero rather than returning a negative rate, which is right for the
  // arithmetic and wrong to leave unsaid: the grading below would quietly
  // report "$0 net" on a load that is actually several hundred dollars in the
  // hole before a wheel turns. Found by scoring a $900 reposition while a
  // previous load's escorts were still on the form.
  const underwaterBy =
    rateNum != null && ptAsk > rateNum ? ptAsk - rateNum : null;

  const pickupReady = !!(pickup.city && pickup.state);
  const deliveryReady = !!(delivery.city && delivery.state);

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
        // A failed route must never leave the PREVIOUS route's miles in the
        // fields wearing a "routed" label — that scored real loads against
        // another load's deadhead (2026-09-08). Clear, don't keep.
        setLoaded("");
        setDeadhead("");
        setDeadheadUnrouted(false);
        setToll(null);
        return;
      }
      setLoaded(res.loadedMiles != null ? String(res.loadedMiles) : "");
      setDeadhead(res.deadheadMiles != null ? String(res.deadheadMiles) : "");
      setDeadheadUnrouted(
        res.deadheadMiles == null &&
          !!(truckNow.city && truckNow.state),
      );
      setToll(res.tollUsd);
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup.city, pickup.state, delivery.city, delivery.state, truckNow.city, truckNow.state, dimsKey]);

  // Deadhead is REQUIRED to score — a blank field is unknown miles, not zero
  // miles, and unknown-as-zero flatters every verdict. Sitting at the shipper?
  // Type 0 and mean it.
  const entered = rate !== "" && loaded !== "" && deadhead !== "";
  // GRADED ON THE RATE NET OF PASS-THROUGHS. A permitted load's headline is
  // close to fiction otherwise: $7,800 over 750 driven miles reads $10.40, and
  // with $3,452 of grossed-up escorts and permits inside it what actually
  // reaches you is $5.80. Subtracting first mirrors the settlement statement,
  // so the number on the page is the number that hits the account.
  const score = scoreLoad(
    { rate: gradedRate, loadedMiles: knownNumber(loaded), deadheadMiles: knownNumber(deadhead) },
    {
      costPerDrivenMile: targets.basis.costPerTotalMile,
      payTake: targets.basis.payTake,
      // Lets the Scorer answer the separate question of whether a load below
      // break-even still beats parking the truck.
      variablePerMile: targets.basis.variablePerMile,
    },
    activeTiers,
  );
  const meta = score.verdict ? VERDICT_META[score.verdict] : null;
  // THE AGENCY CODE IS MANDATORY, and that is the point rather than a
  // formality. You have ten parked agents, nine with a written reason, and an
  // optional field is an optional check — the whole reason it exists is to
  // stop a booking before it starts. A desk that resolves to nobody still
  // counts as answered: typing a code for an agent you have never run with is
  // a real answer ("New agent"), typing nothing is not.
  //
  // A code that matches a desk but was never PICKED is not an answer either:
  // six codes carry two agents, one of them a parked desk beside an active
  // one, and scoring on the unresolved code was the exact hole that let a
  // parked agent through unmarked (the sheet named the case; the first build
  // kept the general path).
  const deskMatches =
    !agent && agentQuery.trim().length >= 2 ? matchAgents(agents ?? [], agentQuery).length : 0;
  const isNewAgent = !agent && agentQuery.trim().length >= 2 && deskMatches === 0;
  const deskAnswered = agent != null || isNewAgent;
  const canScore = targets.ready && entered && !!meta && deskAnswered;

  // What a reposition is worth against sitting: the net it brings home less
  // the fuel, tyres and wear those miles burn. Sitting contributes zero — the
  // fixed costs draft either way, which is exactly why they are absent here.
  const repositionGain =
    gradedRate != null &&
    targets.basis.payTake != null &&
    targets.basis.variablePerMile != null &&
    score.drivenMiles > 0
      ? gradedRate * targets.basis.payTake -
        targets.basis.variablePerMile * score.drivenMiles
      : null;

  const agentStanding = agent ? standingOf(agent) : null;
  const agentParked = agentStanding === "parked";

  const belowTarget = !verdictAtLeast(score.verdict, "take");
  // THE WHOLE LADDER IN DOLLARS, ON EVERY RESULT — the pass-throughs folded
  // in, the offer's gap to each rung, the rung it cleared marked. Above target
  // it says what the offer clears by; it never hides (the sheet's Call 7.2).
  const table = useMemo(
    () => quoteTable(score.breakevenRpm, score.drivenMiles, activeTiers, ptAsk, rateNum),
    [score.breakevenRpm, score.drivenMiles, activeTiers, ptAsk, rateNum],
  );
  const quoteLine = quoteSentence(table, specialized ? "specialized" : "standard");
  const headlineRpm = rateNum != null && score.drivenMiles > 0 ? rateNum / score.drivenMiles : null;
  // What reaches the account: the graded rate (the offer less the grossed-up
  // pass-throughs) at your blended keep — the SAME keep the verdict is graded
  // on, so the tile and the word above it cannot disagree.
  const netDollars =
    gradedRate != null && targets.basis.payTake != null ? gradedRate * targets.basis.payTake : null;

  // A blank deadhead box is unknown, not 0 empty miles (SCORE-02).
  const deadMi = knownNumber(deadhead);
  const deadShare = deadMi != null && score.drivenMiles > 0 ? deadMi / score.drivenMiles : null;
  const freightDrag = deadShare != null && deadShare >= 0.12 && belowTarget;

  const agentCard = agent ? scorecards.get(agent.agent_id) : undefined;

  // The delivery's place alone — the factor re-reads only when the city or
  // state changes, not on every keystroke in the other delivery fields.
  const deliveryPlace = useMemo(() => ({ city: delivery.city, state: delivery.state }), [delivery.city, delivery.state]);
  // The delivery market graded on the Lanes ledger's own window (12 months)
  // against the whole book's yardstick — so this page and Lanes can never
  // disagree about a market.
  const destFactor = useMemo(
    () => destinationFactor(windowLoads(loads ?? [], DEFAULT_WINDOW, now), deliveryPlace, coords, gradeCostsOf(targets)),
    [loads, deliveryPlace, coords, now, targets],
  );
  const call = theCall(score.verdict, destFactor, agentCard, isNewAgent, {
    counterAtTarget: table?.rows.find((r) => r.rung === "target")?.quote ?? null,
    passThroughAsk: ptAsk,
    reposition: reposition ? { beatsSitting: score.beatsSitting, gain: repositionGain } : null,
  });

  const routeNote = routing
    ? "routing…"
    : routeErr
      ? "couldn't route — type the miles in"
      : deadheadUnrouted && loaded
        ? "loaded leg routed · deadhead didn't — type it in"
        : loaded
          ? "routed · edit to override"
          : "enter pickup + delivery to route";

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center gap-3 mb-4">
        <SidebarTrigger />
        <div>
          <p className="font-condensed uppercase tracking-widest text-[12px] text-amber leading-none">
            Take it or leave it
          </p>
          <h1 className="font-display text-[32.5px] text-ink leading-none mt-1">SCORE A LOAD</h1>
        </div>
      </div>

      {scored && meta ? (
        /* ================= RESULT VIEW — full width ================= */
        <div>
          <div className="flex items-center gap-3 flex-wrap mb-3">
            <button
              type="button"
              onClick={() => setScored(false)}
              className="font-condensed text-[14px] text-dim hover:text-ink border border-hairline rounded-lg px-3 py-1.5"
            >
              ‹ Score another
            </button>
            <span className="font-condensed text-[16px] font-semibold text-ink">
              {pickup.city}, {pickup.state} <span className="text-faint">→</span>{" "}
              <span className="text-amber">{delivery.city}, {delivery.state}</span>
            </span>
            <div className="ml-auto flex items-baseline gap-3 flex-wrap">
              <span className="font-condensed text-dim text-[14px]">${Number(rate).toLocaleString("en-US")}</span>
              {agent && <span className="font-condensed text-dim text-[14px]">{agentLabel(agent)}</span>}
              {isNewAgent && <span className="font-condensed font-semibold text-[12px] tracking-[.08em] uppercase" style={{ color: "var(--color-cat2)" }}>NEW AGENT</span>}
              <span className="font-condensed text-[13px] px-2 py-0.5 rounded" style={{ background: "color-mix(in srgb, var(--color-cat2) 14%, transparent)", color: "var(--color-cat2)" }}>
                {specialized ? "Specialized" : "Flatbed"}
              </span>
            </div>
          </div>

          {/* A PARKED DESK LEADS. You have ten parked agents and nine of them
              carry a written reason — "Blacklisted agent", "He doesnt
              dispatch", "Because he's an asshole" — and the Scorer showed none
              of it, so Brandie could score a load from a man you refuse to
              work with, get a PRIME verdict, and never know.

              The score still runs underneath. Knowing what the freight was
              worth is how you decide whether a park is still right; the
              verdict simply cannot be the first thing she reads. */}
          {agentParked && agent && (
            <div
              className="ds2-board p-3.5 mb-3"
              style={{
                borderLeft: "3px solid var(--color-status-negative-text)",
                background: "var(--color-status-negative-bg)",
              }}
            >
              <Lbl accent>⛔ Do not book</Lbl>
              <p className="text-[15.5px] text-ink font-medium">
                {agentLabel(agent)} is parked
                {agent.park_reason?.trim() ? ` — "${agent.park_reason.trim()}"` : "."}
              </p>
              <p className="font-condensed text-[12.5px] text-dim mt-1">
                The load is still scored below, because what the freight is worth is how
                you judge whether the park still holds.
              </p>
            </div>
          )}

          {underwaterBy != null && (
            <div
              className="ds2-board p-3.5 mb-3"
              style={{ borderLeft: "3px solid var(--color-status-negative-text)" }}
            >
              <Lbl accent>Under its own costs</Lbl>
              <p className="text-[15.5px] text-ink font-medium">
                The permits and escorts alone need {money(ptAsk)} of this load, and it
                pays {money(rateNum!)}. You would be {money(underwaterBy)} down before a
                wheel turns — nothing below is a rate you can book.
              </p>
            </div>
          )}

          {/* the call — verdict + destination + agent, weighed */}
          {call && (
            <div
              className="ds2-board p-3.5 mb-3"
              style={{
                borderLeft: `3px solid ${call.tone === "good" ? "var(--color-cat2)" : call.tone === "bad" ? "var(--color-status-negative-text)" : "var(--color-amber)"}`,
              }}
            >
              <Lbl accent>The call</Lbl>
              <p className="text-[15.5px] text-ink font-medium">{call.text}</p>
            </div>
          )}

          {/* verdict hero */}
          <Panel className="p-4 sm:p-5">
            <div className="flex items-center gap-5 flex-wrap">
              {/* REPOSITION SWAPS THE RULER. The ladder asks "what must the
                  month average?"; a reposition asks the different and much
                  narrower question "the alternative right now is sitting still
                  — is this better than that?". Fixed cost is absent from the
                  second because it drafts whether the truck rolls or not. The
                  ladder stays visible underneath: swapping one ruler for the
                  other is how you reposition at $2.10 all year. */}
              <div className="flex-shrink-0">
                <Lbl accent>{reposition ? "Reposition" : "Verdict"}</Lbl>
                {reposition ? (
                  <div
                    className="font-condensed font-bold uppercase leading-none tracking-[.04em]"
                    style={{
                      fontSize: 50,
                      color: score.beatsSitting
                        ? "var(--color-cat2)"
                        : "var(--color-status-negative-text)",
                    }}
                  >
                    {score.beatsSitting == null
                      ? "NO BASIS"
                      : score.beatsSitting
                        ? "BEATS PARKING"
                        : "WORSE THAN PARKING"}
                  </div>
                ) : (
                  <div className="font-condensed font-bold uppercase leading-none tracking-[.04em]" style={{ fontSize: 50, color: meta.fg }}>{meta.label}</div>
                )}
              </div>
              <div className="pl-5" style={{ borderLeft: "1px solid color-mix(in srgb, var(--color-ink) 8%, transparent)" }}>
                <div className="flex items-baseline gap-2">
                  <span className="font-condensed font-semibold tabular-nums text-[36.5px] text-ink">{fmtRpm(score.allInRpm)}</span>
                  <span className="font-condensed text-[14px] text-dim">
                    / driven mi {ptAsk > 0 ? "(after permits & escorts)" : "(all-in)"}
                  </span>
                </div>
                {/* The headline the offer WOULD have claimed, named as the
                    fiction it is. $10.40 a mile with a third of it going to an
                    escort company is not $10.40 a mile. */}
                {ptAsk > 0 && rateNum != null && score.drivenMiles > 0 && (
                  <div className="font-condensed text-[13px] text-faint mt-0.5">
                    {fmtRpm(rateNum / score.drivenMiles)} before the pass-throughs —{" "}
                    {money(ptAsk)} of this load is not yours
                  </div>
                )}
                <div className="font-condensed text-[14px] text-dim mt-0.5">
                  {reposition ? (
                    <>
                      vs your <b className="text-ink">{fmtRpm(score.beatsSittingRpm)}</b> absolute
                      minimum · break-even {fmtRpm(score.breakevenRpm)}{" "}
                      <span className="text-faint">— not the ruler here</span>
                    </>
                  ) : (
                    <>
                      {/* The margin THIS load earns, not the rung's — and only
                          when the markup is actually known. Defaulting a null
                          markup to zero would print "0% margin" for a load we
                          simply could not grade, which is a different and much
                          worse claim than saying nothing. Then the sentence the
                          sheet drew — where the offer fell on the ladder, in
                          dollars: "clears your specialized minimum by $145 ·
                          ask $170 more to hit target". */}
                      {score.verdict !== "pass" && score.pctOverBreakeven != null && (
                        <>
                          <b className="text-ink">{Math.round(marginAtMarkup(score.pctOverBreakeven) * 100)}% margin</b> ·{" "}
                        </>
                      )}
                      {quoteLine ?? (
                        <>
                          <span style={{ color: specialized ? "var(--color-amber-hi)" : "var(--color-cat2)" }}>
                            {specialized ? "Specialized" : "Standard"}
                          </span>{" "}
                          tiers, target +{Math.round(activeTiers.target * 100)}%
                        </>
                      )}
                    </>
                  )}
                </div>
                <div className="font-condensed text-[13px] text-faint mt-1">
                  basis · cash · {targets.basis.windowLabel ?? "no P&L filed"} · {targets.basis.months} of{" "}
                  {targets.basis.monthsWanted} months filed
                  {monthSpread && <> · months ran {fmtRpm(monthSpread.lo)}–{fmtRpm(monthSpread.hi)}</>}
                  {targets.basis.missingLabel && (
                    <span className="text-amber-hi"> · ⚠ no P&L filed for {targets.basis.missingLabel}</span>
                  )}
                </div>
              </div>
              <div className="flex-1 min-w-[220px]">
                <Lbl>Where it lands</Lbl>
                {/* The stripes and their words both come from VERDICT_META, so
                    the gauge cannot name a band the verdict no longer uses. */}
                <div className="flex rounded-[5px] overflow-hidden relative" style={{ height: 10 }}>
                  {VERDICT_ORDER.map((v) => (
                    <div
                      key={v}
                      style={{
                        flex: 1,
                        background: `color-mix(in srgb, ${VERDICT_META[v].fg} 14%, transparent)`,
                      }}
                    />
                  ))}
                  <div
                    style={{
                      position: "absolute",
                      left: `${markerPct(score.pctOverBreakeven, score.allInRpm, score.breakevenRpm, activeTiers)}%`,
                      top: -3,
                      width: 2,
                      height: 16,
                      background: "var(--color-ink)",
                    }}
                  />
                </div>
                <div className="flex justify-between gap-1 text-[10px] font-condensed tracking-[.02em] mt-1">
                  {VERDICT_ORDER.map((v) => (
                    <span key={v} style={{ color: VERDICT_META[v].fg }} className="whitespace-nowrap">
                      {VERDICT_META[v].label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Panel>

          {/* THE FOUR TILES the sheet drew on every result: what the load pays
              you per driven mile, the headline it would have claimed, what
              reaches the account, and the beats-parking line — the last two
              used to show only in reposition mode or on a BELOW COST load. */}
          {!reposition && (
            <div
              className="grid grid-cols-2 xl:grid-cols-4 gap-px bg-hairline border border-hairline rounded-[10px] overflow-hidden mt-3"
              data-testid="result-tiles"
            >
              <Tile
                h="Pays you"
                n={fmtRpm(score.allInRpm)}
                p={ptAsk > 0 ? "per driven mile, after permits and escorts" : "per driven mile, all-in"}
              />
              <Tile
                h="Headline"
                n={fmtRpm(headlineRpm)}
                p={ptAsk > 0 ? "before the pass-throughs" : "no pass-throughs on this load"}
              />
              <Tile
                h="Your net"
                n={netDollars == null ? "—" : money(netDollars)}
                p={ptAsk > 0 ? "after Landstar's cut and the escorts" : "after Landstar's cut"}
              />
              <Tile h="Beats parking" n={fmtRpm(score.beatsSittingRpm)} p="absolute minimum · per driven mile" />
            </div>
          )}

          {!reposition && table && (
            <div className="mt-3">
              <QuoteTablePanel
                table={table}
                offer={rateNum}
                drivenMiles={score.drivenMiles}
                ptCost={ptCost}
                ptAsk={ptAsk}
                ptPremium={ptPremium}
              />
            </div>
          )}

          {/* THE OTHER QUESTION, on a BELOW COST load only. The rungs above
              answer "what should the month average?"; when the agent will not
              meet them, the real choice becomes this load versus sitting still
              — a different, much lower line, because the fixed cost drafts
              either way. Shown only where it is the live question, so it never
              reads as a target. */}
          {!reposition && score.verdict === "pass" && score.beatsSittingRpm != null && (
            <p className="font-condensed text-[12.5px] mt-3 px-1 leading-snug text-faint">
              {score.beatsSitting ? (
                <>
                  <b style={{ color: "var(--color-amber-hi)" }}>It still beats sitting.</b> Moving pays for its
                  own fuel and wear above <b className="text-dim">{fmtRpm(score.beatsSittingRpm)}</b> a driven
                  mile, and this clears that. Worth taking to reach freight you can book properly —{" "}
                  <span className="text-dim">a repositioning cost, never a plan</span>. Fill a month at this
                  rate and the month is a disaster.
                </>
              ) : (
                <>
                  <b style={{ color: "var(--color-status-negative-text)" }}>Worse than parking.</b> Below{" "}
                  <b className="text-dim">{fmtRpm(score.beatsSittingRpm)}</b> a driven mile the miles cost more
                  to run than they bring home, so this loses money faster than standing still.
                </>
              )}
            </p>
          )}

          {/* factor grid — full width */}
          <div className={`grid grid-cols-1 md:grid-cols-2 ${reposition ? "xl:grid-cols-4" : "xl:grid-cols-3"} gap-3 mt-3`}>
            <div className="ds2-board p-4">
              <Lbl>Freight vs deadhead</Lbl>
              <div className="grid grid-cols-2 gap-2.5 mt-2 mb-2.5">
                <Well className="px-3 py-2">
                  <div className="font-condensed text-[12px]" style={{ color: "var(--color-cat2)" }}>FREIGHT</div>
                  <div className="font-condensed font-semibold tabular-nums text-[21.5px] text-ink">
                    {fmtRpm(score.loadedRpm)}<span className="font-condensed text-[12px] text-faint"> /loaded</span>
                  </div>
                </Well>
                <Well className="px-3 py-2">
                  <div className="font-condensed text-[12px] text-amber">DEADHEAD</div>
                  <div className="font-condensed font-semibold tabular-nums text-[21.5px] text-ink">
                    {deadMi == null ? "—" : deadMi.toLocaleString("en-US")}<span className="font-condensed text-[12px] text-faint">{deadMi == null || deadShare == null ? " needs the odometer" : ` mi · ${Math.round(deadShare * 100)}%`}</span>
                  </div>
                </Well>
              </div>
              <p className="text-[13.5px] text-dim">
                {deadShare == null
                  ? "Deadhead unknown — needs the odometer. Type it in (0 only if the truck is already there) and this reads."
                  : freightDrag
                  ? "Good freight — the deadhead is the knock, not the load. Weigh the reposition, or lean on the agent for the backhaul."
                  : deadShare < 0.05
                    ? "Deadhead's slim — this is close to what the freight itself pays."
                    : "Freight rate and all-in are close; deadhead isn't the story here."}
              </p>
              {toll != null && (
                <p className="text-[12.5px] text-faint mt-2">Est. tolls ≈ {money(toll)} · bill as accessorial (Landstar pays 100%)</p>
              )}
            </div>

            {/* destination — where it leaves you */}
            <div className="ds2-board p-4">
              <div className="flex items-center justify-between gap-2">
                <Lbl>Destination · where it leaves you</Lbl>
                <span
                  className="font-condensed font-bold text-[17.5px] uppercase tracking-[.04em]"
                  style={{ color: destFactor.market ? GRADE_META[destFactor.market.grade].color : "var(--color-faint)" }}
                >
                  {destFactor.market ? GRADE_META[destFactor.market.grade].label : "UNPROVEN"}
                </span>
              </div>
              <div className="font-condensed text-[16px] font-semibold text-ink mt-1">
                {delivery.city}, {delivery.state}
              </div>
              {destFactor.market ? (
                <Well className="px-3 py-2 mt-2">
                  <div className="text-[12.5px] text-dim">
                    Your {destFactor.state} outbound:{" "}
                    <span style={{ color: GRADE_META[destFactor.market.grade].color }}>
                      {destFactor.market.loadsOut} load{destFactor.market.loadsOut === 1 ? "" : "s"}
                      {destFactor.market.medianRpm != null ? ` · ${fmtRpm(destFactor.market.medianRpm)}/loaded` : ""}
                    </span>{" "}
                    · {destFactor.market.agents} agent{destFactor.market.agents === 1 ? "" : "s"}
                  </div>
                </Well>
              ) : (
                <div className="text-[12.5px] text-dim mt-2">
                  No outbound history from {destFactor.state || "here"} yet — unproven for you.
                </div>
              )}
              {destFactor.strongMarkets.length > 0 && (
                <>
                  <div className="text-[12px] text-faint mt-2.5">Your strong outbound:</div>
                  <div className="flex gap-1.5 flex-wrap mt-1">
                    {destFactor.strongMarkets.map((m) => (
                      <span
                        key={m.state}
                        className="font-condensed text-[12.5px] px-2 py-0.5 rounded"
                        style={{ background: "color-mix(in srgb, var(--color-cat2) 12%, transparent)", color: "var(--color-cat2)" }}
                      >
                        {m.state} {fmtRpm(m.medianRpm)} · {m.loadsOut}
                      </span>
                    ))}
                  </div>
                </>
              )}
              {destFactor.nearestStrong && (
                <p className="text-[12.5px] text-dim mt-2.5">
                  Nearest strong freight ~{Math.round(destFactor.nearestStrong.miles)} mi ({destFactor.nearestStrong.city}, {destFactor.nearestStrong.state})
                </p>
              )}
            </div>

            <div className="ds2-board p-4">
              <Lbl>The desk</Lbl>
              <div className="mt-1">
                <DeskBrief agent={agent} isNew={isNewAgent} card={agentCard} desk={desk} />
              </div>
            </div>

            {reposition && (
              <div className="ds2-board p-4">
                <Lbl>Against parking</Lbl>
                {repositionGain != null ? (
                  <>
                    <div className="mt-2 flex flex-col gap-2">
                      <Well className="flex items-baseline justify-between px-3 py-1.5">
                        <span className="font-condensed text-[12px] text-dim">YOUR NET, AFTER LANDSTAR</span>
                        <span className="font-condensed font-semibold tabular-nums text-[17px] text-ink">
                          {money(gradedRate! * targets.basis.payTake!)}
                        </span>
                      </Well>
                      <Well className="flex items-baseline justify-between px-3 py-1.5">
                        <span className="font-condensed text-[12px] text-dim">
                          FUEL, TYRES, WEAR ON {score.drivenMiles.toLocaleString("en-US")} MI
                        </span>
                        <span className="font-condensed font-semibold tabular-nums text-[17px]" style={{ color: "var(--color-status-negative-text)" }}>
                          −{money(targets.basis.variablePerMile! * score.drivenMiles)}
                        </span>
                      </Well>
                      <Well
                        className="flex items-baseline justify-between px-3 py-1.5"
                        style={{
                          borderColor: `color-mix(in srgb, ${repositionGain >= 0 ? "var(--color-cat2)" : "var(--color-status-negative-text)"} 45%, transparent)`,
                        }}
                      >
                        <span className="font-condensed text-[12px]" style={{ color: repositionGain >= 0 ? "var(--color-cat2)" : "var(--color-status-negative-text)" }}>
                          {repositionGain >= 0 ? "BETTER THAN PARKING BY" : "WORSE THAN PARKING BY"}
                        </span>
                        <span className="font-condensed font-semibold tabular-nums text-[19.5px]" style={{ color: repositionGain >= 0 ? "var(--color-cat2)" : "var(--color-status-negative-text)" }}>
                          {repositionGain >= 0 ? "+" : "−"}{money(Math.abs(repositionGain))}
                        </span>
                      </Well>
                    </div>
                    {/* The assumption said out loud. "Better than parking" is
                        only true if parking was the alternative — if a real
                        load would have come along, the reposition cost you the
                        good one. A green number must not imply certainty. */}
                    <p className="font-condensed text-[12.5px] mt-3 leading-snug text-faint">
                      Assumes nothing better turns up for those days. If something might,
                      this is the number to beat — not a reason to take it.
                    </p>
                  </>
                ) : (
                  <p className="font-condensed text-[13px] text-faint mt-2">
                    Needs a cost basis and a variable cost per mile before this can be
                    answered.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ================= FORM VIEW — the board ================= */
        /* Was a 440px ribbon down the middle of a laptop: mx-auto with a
           hard maxWidth, a third of the page with empty space either side,
           while the RESULT view below was already a full-width grid. Only
           the input side was left narrow. Now the load is on the left and
           the desk you are booking it against is on the right, so the brief
           fills as the code resolves rather than after the decision. One
           column on a phone, load first. */
        <div className="mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3 items-start" style={{ maxWidth: 1040 }}>
          <div className="ds2-board p-4 sm:p-5">
          <NumField label="Rate offered" value={rate} onChange={setRate} prefix="$" />

          <p className="font-condensed uppercase tracking-widest text-[11px] text-faint mt-4 mb-1.5">
            Route <span className="normal-case tracking-normal" style={{ color: "var(--color-faint)" }}>— city autocompletes</span>
          </p>
          <PlaceRow label="Truck now" place={truckNow} onChange={setTruck} />
          <PlaceRow label="Pickup" place={pickup} onChange={setPickup} />
          <PlaceRow label="Delivery" place={delivery} onChange={setDelivery} />


          <p className="font-condensed uppercase tracking-widest text-[11px] text-faint mt-4 mb-1.5">
            Load size <span className="normal-case tracking-normal" style={{ color: "var(--color-faint)" }}>— leave blank if legal</span>
          </p>
          <div className="mb-2">
            {/* FREIGHT, which is what an agent actually quotes. Gross is
                computed from your empty weight and shown underneath, labelled
                as computed — so Brandie can see the scale ticket she'd get. */}
            <NumField label="Freight weight" value={wt} onChange={setWt} suffix="lb" />
            {freightLb != null && (
              <p className="text-[11.5px] mt-1 font-condensed">
                {grossLb != null ? (
                  <span className={grossLb > 80000 ? "text-amber-hi" : "text-faint"}>
                    + {emptyWeightLb!.toLocaleString("en-US")} empty ={" "}
                    <b className="text-ink">{grossLb.toLocaleString("en-US")} lb gross</b>
                    {ceilingLb != null && freightLb > ceilingLb && (
                      <> · over your {ceilingLb.toLocaleString("en-US")} lb ceiling → <b>specialized</b></>
                    )}
                  </span>
                ) : (
                  <span className="text-faint">
                    Set your empty weight in{" "}
                    <Link to="/settings" className="text-amber-hi underline underline-offset-2">
                      Settings
                    </Link>{" "}
                    and a heavy load will price on your specialized tiers.
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex gap-2 mb-2.5">
            <DimField label="Length" val={len} onChange={setLen} />
            <DimField label="Width" val={wid} onChange={setWid} accent={oversize.reasons.some((r) => r.startsWith("width"))} />
            <DimField label="Height" val={hgt} onChange={setHgt} />
          </div>

          <label
            className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer select-none bg-well border ${hazmat ? "border-amber/60" : "border-hairline"}`}
          >
            <input type="checkbox" checked={hazmat} onChange={(e) => setHazmat(e.target.checked)} className="accent-amber" />
            <span className="text-[13.5px] text-ink">Hazmat</span>
            <span className="ml-auto text-[11px] text-faint">premium · specialized tiers</span>
          </label>

          {/* PERMITS & ESCORTS — only once the load is over legal, so a plain
              flatbed run sees the form it always saw. These are bills you pay
              and are not reimbursed for: Landstar deducts the charge from the
              linehaul and pays it back at the same 73% split, so the load has
              to carry cost ÷ 0.73 for you to break even on it. */}
          {permitted && (
            <div className="mt-2.5 pt-2.5 border-t border-hairline">
              <p className="font-condensed uppercase tracking-widest text-[11px] text-faint mb-1.5">
                Permits &amp; escorts{" "}
                <span className="normal-case tracking-normal text-faint">
                  — this load is over legal
                </span>
              </p>
              <div className="flex gap-2">
                <NumField label="Permits (states)" value={permits} onChange={setPermits} />
                <NumField label="Escorts" value={escorts} onChange={setEscorts} />
              </div>
              {ptCost.total > 0 ? (
                <p className="text-[11.5px] font-condensed text-dim mt-1.5">
                  {ptCost.permits > 0 && <>{money(ptCost.permits)} permits</>}
                  {ptCost.permits > 0 && ptCost.escorts > 0 && " + "}
                  {ptCost.escorts > 0 && <>{money(ptCost.escorts)} escorts</>} ={" "}
                  <b className="text-ink">{money(ptCost.total)}</b> out of pocket · the load
                  must carry <b className="text-amber-hi">{money(ptAsk)}</b>
                </p>
              ) : (
                (permits !== "" || escorts !== "") && (
                  <p className="text-[11.5px] font-condensed text-faint mt-1.5">
                    Set your permit and escort costs in{" "}
                    <Link to="/settings" className="text-amber-hi underline underline-offset-2">
                      Settings
                    </Link>{" "}
                    to price these in.
                  </p>
                )
              )}
            </div>
          )}

          {/* REPOSITION — a different ruler, not a softer rung. When you are
              going to run the miles anyway the fixed cost is sunk, so the only
              money the decision turns on is what driving itself burns. */}
          <label
            className={`flex items-center gap-2 px-3 py-2 mt-2.5 rounded-lg cursor-pointer select-none bg-well border ${reposition ? "border-amber/60" : "border-hairline"}`}
          >
            <input
              type="checkbox"
              checked={reposition}
              onChange={(e) => setReposition(e.target.checked)}
              className="accent-amber"
            />
            <span className="text-[13.5px] text-ink">Reposition load</span>
            <span className="ml-auto text-[11px] text-faint">grade against my absolute minimum</span>
          </label>

          {anyDim &&
            (oversize.oversize ? (
              <div className="flex items-start gap-2 px-3 py-2 mt-2.5 rounded-lg" style={{ background: "var(--color-status-aware-bg)", border: "1px solid color-mix(in srgb, var(--color-amber) 50%, transparent)" }}>
                <span className="font-condensed font-semibold text-[12px] tracking-[.08em] uppercase text-amber">OVERSIZE</span>
                <span className="text-[12px] mt-0.5 text-dim">{oversize.reasons.join(" · ")} → specialized tiers</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 mt-2.5 rounded-lg" style={{ background: "var(--color-status-positive-bg)", border: "1px solid color-mix(in srgb, var(--color-cat2) 45%, transparent)" }}>
                <span className="font-condensed font-semibold text-[12px] tracking-[.08em] uppercase" style={{ color: "var(--color-cat2)" }}>LEGAL</span>
                <span className="text-[12px] text-dim">standard flatbed → standard tiers</span>
              </div>
            ))}

          <div className="text-[11px] mt-3 mb-1" style={{ color: routeErr ? "var(--color-amber)" : "var(--color-faint)" }}>
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

          {!targets.ready ? (
            <p className="text-xs text-dim mt-5 text-center">
              Upload a P&amp;L on the Expenses page to calibrate your break-even, then loads can be scored.
            </p>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setScored(true)}
                disabled={!canScore}
                className={`w-full mt-5 py-3 rounded-lg font-condensed font-semibold text-[18.5px] tracking-[.08em] transition-colors ${
                  canScore ? "bg-amber text-on-amber hover:brightness-110" : "bg-well text-faint border border-hairline cursor-not-allowed"
                }`}
              >
                SCORE IT ▸
              </button>
              {!canScore && (
                <p className="text-[12px] text-faint text-center mt-1.5">
                  {entered && !deskAnswered
                    ? deskMatches > 0
                      ? `pick the desk — "${agentQuery.trim()}" matches ${deskMatches}, and a parked one has to be seen before you book`
                      : "enter the agency code first — it's how a parked desk gets caught before you book"
                    : "enter a rate, loaded miles, and deadhead to score — type 0 deadhead only if the truck is already there"}
                </p>
              )}
            </>
          )}
          </div>

          {/* THE DESK — beside the load, not after it. */}
          <div className="ds2-board p-4 sm:p-5 lg:sticky lg:top-3">
            <div className="mt-3">
              <Lbl accent>
                Agency code <span style={{ color: "var(--color-status-negative-text)" }}>*</span>
              </Lbl>
              <AgentField agents={agents ?? []} query={agentQuery} onQuery={setAgentQuery} selected={agent} onPick={setAgent} />
              {deskMatches > 0 && (
                <p className="mt-1.5 text-[12px] text-amber-hi">
                  "{agentQuery.trim()}" matches {deskMatches} desk{deskMatches === 1 ? "" : "s"} — pick one from the list
                </p>
              )}
              {/* THE BRIEF FILLS AS THE CODE RESOLVES — the rating, the history,
                  the phone, the latest dated notes; a parked desk replaces the
                  whole block with the banner and the reason you wrote. A banner
                  you read after deciding is decoration. */}
              <div className="mt-3">
                <DeskBrief agent={agent} isNew={isNewAgent} card={agentCard} desk={desk} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScoreLoadPage;
