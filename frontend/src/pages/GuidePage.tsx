import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Trophy, ArrowRight } from "lucide-react";
import { RatingMedallion } from "@/components/agents/RatingMedallion";
import { PrestigeBurst, PRESTIGE_META } from "@/components/agents/PrestigeBadge";
import type { PrestigeTier } from "@/lib/metrics/agentLeaderboard";
import { awardIcon } from "@/components/awards/awardIcons";
import { PATCH_GUIDE } from "@/lib/awards/patches";
import { MEDAL_GUIDE } from "@/lib/awards/medals";
import { TRUCK_PATCH_GUIDE, TRUCK_MEDAL_GUIDE } from "@/lib/awards/truckAwards";
import {
  TRAILER_PATCH_GUIDE,
  TRAILER_MEDAL_GUIDE,
} from "@/lib/awards/trailerAwards";

const AMBER = "#e8940a";
const AMBER_HI = "#f5b03a";
const GREEN = "#1d9e75";
const TRACK = "#232c3f";

const RATINGS: [number, string][] = [
  [5, "Your go-to. Call these agents before anyone else."],
  [4, "Solid and reliable — happy to run their freight."],
  [3, "Neutral baseline. No strong feelings either way."],
  [2, "Steer clear unless the load is worth it."],
  [1, "Don't run their freight."],
];

const TIERS: [PrestigeTier, string][] = [
  ["contender", "Made a quarterly top 5 (2+ loads that quarter)."],
  ["all-star", "Won a gold or silver trophy."],
  ["champion", "Took gold in 3 or more quarters."],
  ["legend", "Took gold in 8 or more quarters."],
];

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="ds-panel ds-panel--default p-5 mb-4">
    <h2 className="font-condensed text-xl mb-3">{title}</h2>
    {children}
  </section>
);

// One row in the award catalog: emblem + name + how to earn it.
const AwardLine = ({ icon, name, sub }: { icon: string; name: string; sub: string }) => {
  const Icon = awardIcon(icon);
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        style={{ background: "#3a2a0a", color: AMBER_HI }}
      >
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-text">{sub}</p>
      </div>
    </div>
  );
};

// ---- building blocks for the money metrics ----

// A metric card: what it answers, the formula, and the reasoning.
const Metric = ({
  title,
  answers,
  children,
}: {
  title: string;
  answers: string;
  children: ReactNode;
}) => (
  <section className="ds-panel ds-panel--default p-5 mb-4">
    <h3 className="font-condensed text-lg" style={{ color: AMBER_HI }}>
      {title}
    </h3>
    <p className="text-sm text-muted-text mt-0.5 mb-3">{answers}</p>
    {children}
  </section>
);

// The formula, set apart so it reads as "the math."
const Formula = ({ children }: { children: ReactNode }) => (
  <div
    className="rounded-md px-3 py-2.5 text-sm font-condensed leading-relaxed"
    style={{ background: "#0d1119", border: "1px solid #22304a", color: "#f5e6c8" }}
  >
    {children}
  </div>
);

const Eg = ({ children }: { children: ReactNode }) => (
  <p className="text-xs text-muted-text mt-2">
    <span style={{ color: AMBER }}>e.g.</span> {children}
  </p>
);

const Why = ({ children }: { children: ReactNode }) => (
  <p className="text-sm text-muted-text mt-3">{children}</p>
);

// How much of each component of a load's rate you keep.
const KeepBar = ({ label, pct, note }: { label: string; pct: number; note?: string }) => (
  <div className="flex items-center gap-3">
    <span className="w-28 shrink-0 text-sm">{label}</span>
    <div className="flex-1 h-3 rounded overflow-hidden" style={{ background: TRACK }}>
      <div className="h-full" style={{ width: `${pct}%`, background: GREEN }} />
    </div>
    <span className="w-24 shrink-0 text-xs text-right text-muted-text">
      {note ?? `${pct}% to you`}
    </span>
  </div>
);

// The cost → book-rate chain, left to right.
const ChainBox = ({ top, bottom }: { top: string; bottom: string }) => (
  <div
    className="rounded-md px-3 py-2 text-center min-w-[120px]"
    style={{ background: "#0d1119", border: "1px solid #22304a" }}
  >
    <div className="font-condensed text-base" style={{ color: AMBER_HI }}>
      {top}
    </div>
    <div className="text-[11px] text-muted-text">{bottom}</div>
  </div>
);

// Weeks the truck ran (filled) vs idle — the utilization illustration.
const UtilBar = ({ active, total }: { active: number; total: number }) => (
  <div className="flex gap-1 flex-wrap">
    {Array.from({ length: total }, (_, i) => (
      <div
        key={i}
        className="w-4 h-4 rounded-sm"
        style={{ background: i < active ? GREEN : TRACK }}
      />
    ))}
  </div>
);

// A static rate ladder for illustration.
const MiniLadder = () => (
  <div>
    <div className="flex h-3 rounded overflow-hidden" style={{ background: TRACK }}>
      <div style={{ width: "58%", background: AMBER, opacity: 0.55 }} />
      <div style={{ flex: 1, background: GREEN, opacity: 0.55 }} />
    </div>
    <div className="relative h-9 mt-1 text-xs text-muted-text">
      <span className="absolute left-0">
        walk-away
        <br />
        <span className="text-light">$4.34</span>
      </span>
      <span className="absolute left-[58%] -translate-x-1/2 text-center">
        target
        <br />
        <span className="text-light">$5.86</span>
      </span>
      <span className="absolute right-0 text-right">
        strong
        <br />
        <span className="text-light">$6.94</span>
      </span>
    </div>
  </div>
);

const GuidePage = () => (
  <div className="p-6 bg-iron text-light font-body min-h-screen">
    <div className="max-w-3xl">
      <h1 className="text-3xl font-condensed mb-1">Guide</h1>
      <p className="text-muted-text text-sm mb-6">
        Every number in dash, and exactly how it's built — so you can check the
        math, not just trust it. The figures below are worked examples; your live
        numbers are on the dashboard and Expenses page.
      </p>

      <h2 className="font-condensed text-2xl mb-3" style={{ color: AMBER_HI }}>
        The money
      </h2>

      <Metric
        title="Your net revenue — what you actually keep"
        answers="Every revenue figure in dash is your net take-home, not the full rate the customer paid."
      >
        <Formula>
          net = linehaul × your&nbsp;linehaul&nbsp;% + fuel&nbsp;surcharge × 100% +
          each accessorial × its own rate
        </Formula>
        <div className="flex flex-col gap-2 mt-3">
          <KeepBar label="Linehaul" pct={73} />
          <KeepBar label="Fuel surcharge" pct={100} />
          <KeepBar label="Accessorials" pct={100} note="by type (0–100%)" />
        </div>
        <Why>
          You book the full customer rate, but your leased carrier keeps a cut. In
          this example you keep <span className="text-light">73% of linehaul</span>,{" "}
          <span className="text-light">100% of fuel surcharge</span>, and
          accessorials by type (tarp 100%, hazmat 73%, excess-value 0%) — every
          percentage is yours to set in <span className="text-light">Settings</span>.
          On your own authority you keep it all: set everything to 100%.
        </Why>
      </Metric>

      <Metric
        title="True cost per mile"
        answers="What it costs to roll one mile, everything in."
      >
        <Formula>
          true cost = P&amp;L operating cost + monthly obligations (truck note,
          etc.)
          <br />
          cost per mile = true cost ÷ every mile you drove
        </Formula>
        <Eg>$23,600/mo ÷ ~7,450 miles ≈ $3.17 per mile.</Eg>
        <Why>
          Blended over your last <span className="text-light">3 complete months</span>{" "}
          (rolling ~90 days) so one lumpy month — a big repair, say — doesn't swing
          it. It's over <span className="text-light">total</span> miles (loaded and
          empty), because every mile you drive costs you.
        </Why>
      </Metric>

      <Metric
        title="Break-even — the rate to book"
        answers="The gross rate per mile you have to book to cover your cost."
      >
        <div className="flex items-center gap-2 flex-wrap my-1">
          <ChainBox top="$3.17" bottom="cost / mile" />
          <ArrowRight size={16} className="text-muted-text" />
          <ChainBox top="÷ 73%" bottom="your keep" />
          <ArrowRight size={16} className="text-muted-text" />
          <ChainBox top="$4.34" bottom="gross to book" />
        </div>
        <Why>
          Two haircuts, and they're different: you fold your{" "}
          <span className="text-light">deadhead</span> into the miles yourself (cost
          is spread over every mile you drive), and you only{" "}
          <span className="text-light">keep 73%</span> of what you book — so the
          rate to book is your cost-per-mile ÷ 0.73. Anything above{" "}
          <span className="text-light">$4.34</span> (with your empty miles counted)
          makes money. It's conservative: you keep 100% of fuel surcharge on top, so
          your real cushion is a bit bigger.
        </Why>
      </Metric>

      <Metric
        title="The rate ladder"
        answers="Where your booked rate lands against your targets."
      >
        <MiniLadder />
        <Formula>
          walk-away = break-even · minimum = ×1.15 · target = ×1.35 · strong = ×1.60
        </Formula>
        <Why>
          The tiers mark up your break-even by 15 / 35 / 60%. The marker on the
          dashboard is your actual gross rate per mile — where you're really pricing.
        </Why>
      </Metric>

      <Metric
        title="Weekly & daily targets"
        answers="The gross dollars to book each week and day."
      >
        <Formula>
          weekly = (true cost ÷ your keep) ÷ 4.33 weeks
          <br />
          daily = (true cost ÷ your keep) ÷ 22 working days · × tiers for target/strong
        </Formula>
        <Why>
          Same idea as the ladder, in dollars instead of per-mile — and all in{" "}
          <span className="text-light">gross booking dollars</span>, the number you
          track when you take a load.
        </Why>
      </Metric>

      <Metric
        title="Rate per mile (RPM)"
        answers="Your net rate on the miles you actually get paid for."
      >
        <Formula>RPM = net revenue ÷ loaded miles</Formula>
        <Why>
          Loaded miles, not total — because the customer pays you for the haul, not
          your empty run to the pickup.
        </Why>
      </Metric>

      <Metric
        title="Lane rate — typical vs blended"
        answers="On the Lanes page each rate is the typical load, so one fluke haul can't crown a lane it can't repeat."
      >
        <Formula>
          typical $/mi = median of each load's rate · blended = gross ÷ all loaded
          miles
        </Formula>
        <Eg>
          Five loads near $2.10 and one short oversize at $6.00 → blended reads $2.72,
          but <span className="text-light">typical is $2.10</span> — the number you'll
          actually see next time. Lanes rank on typical; blended rides underneath.
        </Eg>
        <Why>
          A lane with only a handful of loads is easily skewed by a single
          high-accessorial run. The median asks "what does a normal load here pay,"
          which is the honest basis for deciding where to book.
        </Why>
      </Metric>

      <Metric
        title="Outstanding loads — how long money sits"
        answers="The headline aging is the typical unpaid load, with the oldest called out separately."
      >
        <Formula>median days outstanding · oldest days outstanding</Formula>
        <Eg>
          Loads out 12, 18, and 61 days → <span className="text-light">median 18d</span>
          , oldest 61d. A mean would say 30d and bury the fact that one disputed
          invoice is the real problem.
        </Eg>
        <Why>
          One stuck invoice shouldn't make routine collections look slow. The median
          shows the normal pace; the oldest surfaces the exception instead of hiding
          it.
        </Why>
      </Metric>

      <Metric
        title="Per diem — the meal-allowance deduction"
        answers="Your days out, turned into the M&IE tax deduction. Mark days on a year calendar; unmarked past days are inferred from your loads."
      >
        <Formula>
          (full days × rate + half days × 75% × rate) × 80% deductible
        </Formula>
        <Eg>
          A week out = 5 full days + 2 half days (the days you left and got home).
          Each day away overnight counts; the departure and return days are 75%.
        </Eg>
        <Why>
          As a DOT hours-of-service driver you deduct <span className="text-light">80%</span>{" "}
          of the IRS special rate (vs 50% for everyone else). The rate updates each
          October — set it and the deductible on the Settings page. On the Per Diem
          page, tap a day to cycle home → full → half; days you haven't marked yet
          this year are inferred from your delivered loads (shown hollow) for you to
          confirm.
        </Why>
      </Metric>

      <Metric
        title="Deadhead"
        answers="The share of your miles that ran empty."
      >
        <Formula>deadhead % = (total miles − loaded miles) ÷ total miles</Formula>
        <Why>
          Total miles come from your odometer (loads + fuel + service readings);
          loaded miles are the paid distance. Lower is better — every empty mile is
          cost with no revenue.
        </Why>
      </Metric>

      <Metric
        title="Fuel economy (MPG)"
        answers="Real MPG, measured tank to tank — not the dash estimate."
      >
        <Formula>
          MPG = miles between full fills ÷ every gallon added in that stretch
        </Formula>
        <Why>
          A fill of <span className="text-light">120+ gallons</span> is a full tank;
          smaller top-offs roll into the next full. Measuring full-to-full is why
          it's honest — actual pump gallons against actual odometer miles.
        </Why>
      </Metric>

      <h2 className="font-condensed text-2xl mb-3 mt-8" style={{ color: AMBER_HI }}>
        The dock — facilities, scheduling &amp; detention
      </h2>

      <Metric
        title="Facilities — your shippers and receivers"
        answers="Every stop is a saved place, kept apart by location so the many Walmarts never blur into one."
      >
        <Why>
          On a load, search your existing facilities as you type and pick one — that's
          what keeps the data clean. A <span className="text-light">business</span> is
          known by its name; a <span className="text-light">job site</span> has no
          company name, so it's known by its address. If two of the same place slip in
          (ABC Manufacturing vs ABC Manufacturing Inc), the Facilities page flags them
          under "Possible duplicates" so you can merge them into one.
        </Why>
      </Metric>

      <Metric
        title="Appointment or window"
        answers="Each stop gets a scheduled time — a set appointment or a delivery window."
      >
        <Formula>appointment = one time · window = a start–end range</Formula>
        <Eg>
          On the load form, leave the "to" blank for a set appointment (9:00), or fill
          it for a window (6:00–10:00, first-come-first-served).
        </Eg>
        <Why>
          Once you also log when you arrived, the stop shows an on-time badge:{" "}
          <span className="text-light">on time</span>,{" "}
          <span className="text-light">late</span>, or{" "}
          <span className="text-light">waited</span> (you beat the window open).
        </Why>
      </Metric>

      <Metric
        title="In / out times & dwell"
        answers="Log when you arrived and left each stop; dwell is how long you sat."
      >
        <Formula>dwell = departed − arrived</Formula>
        <Eg>
          Arrived 8:30a, left 10:45a → <span className="text-light">2h 15m</span> at the
          dock. Overnight stays are handled.
        </Eg>
      </Metric>

      <Metric
        title="Detention — the wait you're owed for"
        answers="When a stop holds you past your free time, the load flags detention automatically."
      >
        <Formula>detention = dwell − free hours (per stop)</Formula>
        <Eg>
          Sat 5h 20m with 3h free → <span className="text-light">2h 20m</span> billable.
          Set your free hours on the Settings page (you give 3).
        </Eg>
        <Why>
          The load shows a "Detention owed" banner and the loads table flags the row.
          Bill the hours as an accessorial, then hit{" "}
          <span className="text-light">Mark detention paid</span> to clear it.
        </Why>
      </Metric>

      <Metric
        title="TONU — the dead-run fee"
        answers="A truck-ordered-not-used load still owes you a fee."
      >
        <Why>
          A TONU flags red until you collect it. Mark it{" "}
          <span className="text-light">TONU paid</span> the same way you clear
          detention.
        </Why>
      </Metric>

      <Section title="The loads table, by color">
        <p className="text-sm text-muted-text mb-2">
          A left bar and row tint tell you what needs action, worst first:
        </p>
        <div className="text-sm flex flex-col gap-1.5">
          <p>
            <span style={{ color: "#3fb950" }}>● Green</span> — in transit. These lift
            into an "On the road" group up top, so what's rolling is always in view.
          </p>
          <p>
            <span style={{ color: "#e8940a" }}>● Amber</span> — detention owed &amp;
            unpaid (with a "DET" chip).
          </p>
          <p>
            <span style={{ color: "#e24b4a" }}>● Red</span> — a TONU fee owed &amp;
            unpaid.
          </p>
        </div>
        <p className="text-sm text-muted-text mt-2">
          Amber and red clear to a muted "paid" chip once you mark them. Filter the
          table by <span className="text-light">TONU</span> or{" "}
          <span className="text-light">Detention</span> to work through what's owed.
        </p>
      </Section>

      <Section title="Facility & agent scorecards">
        <p className="text-sm text-muted-text">
          As your stop times pile up, each facility and agent grows a scorecard —{" "}
          <span className="text-light">typical dwell</span> (the median, so one bad day
          doesn't skew it), <span className="text-light">on-time %</span>, and how often
          loads there ran into detention. It needs at least three timed stops before it
          shows, so it fills in over a few weeks — that's how you learn which docks eat
          your day and which agents' freight is worth the rate.
        </p>
      </Section>

      <h2 className="font-condensed text-2xl mb-3 mt-8" style={{ color: AMBER_HI }}>
        The driver card
      </h2>

      <Metric
        title="Bottleneck — your three profit levers"
        answers="Your season net breaks into Rate × Utilization × Margin. The card grades all three and names the weakest — the one holding you back."
      >
        <Formula>net ≈ Rate × Utilization × Margin · bottleneck = the weakest lever</Formula>
        <Why>
          Each lever grades <span className="text-light">Below → Minimum → Target →
          Strong</span>: <span className="text-light">Rate</span> against your
          break-even ladder, <span className="text-light">Utilization</span> against
          the 70/80/85% benchmark, <span className="text-light">Op margin</span>{" "}
          against your margin tiers. They mask each other — a great rate with the
          truck sitting still nets mediocre — so the card names whichever is lagging
          and what to do about it. When all three reach Target, it reads{" "}
          <span style={{ color: "#4ade80" }}>Firing on all cylinders</span>.
        </Why>
      </Metric>

      <Metric
        title="Equipment mix — oversize &amp; heavy haul"
        answers="How much of your delivered work is oversize, and separately, heavy haul. Clear a high bar in either and the card names you a specialist."
      >
        <Formula>loads of that type ÷ your delivered loads</Formula>
        <Eg>
          12 oversize of 48 delivered → <span className="text-light">25%</span>. The
          specialist badge lights at{" "}
          <span className="text-light">40% and at least 5 loads</span>.
        </Eg>
        <Why>
          Oversize and heavy haul are different disciplines — different equipment,
          permits, and skill — so each gets its own strip and its own badge. A strip
          appears once you've delivered{" "}
          <span className="text-light">10+ loads</span> of that type, so a one-off
          doesn't earn a card. Standard and hazmat loads aren't counted toward either.
        </Why>
      </Metric>

      <Metric
        title="Hometime — days since you were home"
        answers="Days since your most recent home day. Past your threshold, the card flags it so a long stretch out doesn't sneak up on you."
      >
        <Formula>today − your last home day · flag when it crosses your threshold</Formula>
        <Eg>
          Home June 27, today July 15 → <span className="text-light">18 days out</span>.
          Under a 21-day target it stays calm; cross 21 and it turns to a red flag.
        </Eg>
        <Why>
          It reads home days from the Per Diem calendar — mark them there to keep it
          honest. Set the threshold on the Settings page (default{" "}
          <span className="text-light">21 days</span>). No home marks yet? The card
          nudges you to start rather than guess.
        </Why>
      </Metric>

      <h2 className="font-condensed text-2xl mb-3 mt-8" style={{ color: AMBER_HI }}>
        The truck
      </h2>

      <Metric
        title="Utilization — how hard the truck runs"
        answers="The share of days the truck was under a load — pickup to delivery — since your first logged load. Idle days pull it down."
      >
        <Formula>days under load ÷ days in window</Formula>
        <div className="mt-3">
          <UtilBar active={138} total={190} />
        </div>
        <Eg>
          Under a load 138 of 190 days →{" "}
          <span className="text-light">73%</span>. The day breakdown splits the
          rest: <span style={{ color: "#60a5fa" }}>home</span> days (you marked
          home and ran nothing) vs <span style={{ color: "#f87171" }}>idle</span>{" "}
          days (no load, not home) — so a low number tells you whether it was time
          off or missing freight. Home days still count against utilization; it's
          your truck's real opportunity cost. The window starts at your first logged
          load, so weeks before you were entering loads don't read as idle.
        </Eg>
        <Why>
          Across a fleet, this is the number that exposes a truck sitting idle while
          the others run.{" "}
          <span className="text-light">Benchmark:</span> best-in-class fleets run{" "}
          <span className="text-light">80–85%</span>; under{" "}
          <span className="text-light">70%</span> signals real idle time or weak
          load planning. Measuring days-under-load (not hours) keeps it close to the
          industry's revenue-hours ÷ available-hours, so the benchmark is a fair
          read. It also powers the <span className="text-light">Road Warrior</span>{" "}
          medal (70 · 80 · 85%).
          <span className="block mt-1 text-xs text-muted-text">
            Sources:{" "}
            <a
              href="https://fleetrabbit.com/industry/transportation-and-logistics/improving-truck-fleet-utilization-above-85-percent-across-lanes-and-terminals-2026"
              target="_blank"
              rel="noreferrer"
              className="text-status-info-text hover:underline"
            >
              FleetRabbit (2026)
            </a>
            ,{" "}
            <a
              href="https://www.atbs.com/post/how-have-owner-operators-performed-so-far"
              target="_blank"
              rel="noreferrer"
              className="text-status-info-text hover:underline"
            >
              ATBS
            </a>
            .
          </span>
        </Why>
      </Metric>

      <Metric
        title="Fuel economy — miles per gallon"
        answers="Computed the honest way — only across full tank-to-full-tank windows, so a partial fill never skews a tank's rate."
      >
        <Formula>miles between full tanks ÷ gallons burned</Formula>
        <Eg>
          1,400 mi on 200 gal = <span className="text-light">7.0 mpg</span>. Best
          tank is your record; the rolling average is what the Fuel Miser medal
          climbs.
        </Eg>
      </Metric>

      <Metric
        title="Cost to run per mile — what the truck costs you"
        answers="The truck's own operating cost per mile — fuel plus maintenance. The truck note isn't here; it lives on the payoff tracker, so it's never double-counted."
      >
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <ChainBox top="$0.58" bottom="fuel / mi" />
          <span className="text-muted-text">+</span>
          <ChainBox top="$0.14" bottom="maintenance / mi" />
          <span className="text-muted-text">=</span>
          <ChainBox top="$0.72" bottom="cost to run / mi" />
        </div>
        <Formula>(fuel spend + maintenance spend) ÷ miles driven</Formula>
        <Why>The real cost of keeping this truck rolling, kept separate from financing.</Why>
      </Metric>

      <Metric
        title="Revenue per mile — what each mile earns"
        answers="The truck's net revenue spread over every mile it drove — its earning efficiency."
      >
        <Formula>truck net revenue ÷ total miles driven</Formula>
        <Eg>
          $141k ÷ 55,000 mi = <span className="text-light">$2.57 / mi</span>.
          Miles/month rounds it out — how hard the truck runs.
        </Eg>
      </Metric>

      <h2 className="font-condensed text-2xl mb-3 mt-8" style={{ color: AMBER_HI }}>
        The award system
      </h2>

      <Section title="Four ways to win">
        <p className="text-sm text-muted-text">
          Everything you earn stacks into four tiers, smallest to grandest:
        </p>
        <ul className="text-sm text-muted-text mt-2 space-y-1.5 list-none">
          <li>
            <span className="text-light">Records</span> — your personal bests. They
            climb every time you beat your own number.
          </li>
          <li>
            <span className="text-light">Patches</span> — hard feats that{" "}
            <span className="text-light">stack a ×count</span> each time you re-earn
            them. The "impressive" ones set their bar from your own top-5 history —
            it ratchets up as you improve and never eases in a downturn.
          </li>
          <li>
            <span className="text-light">Medals</span> — fixed milestone ladders you
            climb I → II → III, worn on your card.
          </li>
          <li>
            <span className="text-light">Trophies</span> — once-in-a-career monuments
            in the Trophy Room.
          </li>
        </ul>
      </Section>

      <Section title="Driver medals — climb the tiers">
        <div className="grid sm:grid-cols-2 gap-x-6">
          {MEDAL_GUIDE.map((m) => (
            <AwardLine key={m.name} icon={m.icon} name={m.name} sub={m.tiers} />
          ))}
        </div>
      </Section>

      <Section title="Driver patches — hard, and they stack">
        <p className="text-sm text-muted-text mb-3">
          Patches earned in <span style={{ color: "#60a5fa" }}>blue</span> are your{" "}
          <span className="text-light">operation-specific</span> feats — the
          oversize/flatbed set (Wide, Long, Super Load, Mountain Mover) tied to your
          Operation setting. The rest are <span style={{ color: "#f5b03a" }}>amber</span>{" "}
          universal feats every operation can earn. Set your operation on the{" "}
          <Link to="/settings" className="text-status-info-text hover:underline">
            Settings page
          </Link>
          .
        </p>
        <div className="grid sm:grid-cols-2 gap-x-6">
          {PATCH_GUIDE.map((p) => (
            <AwardLine key={p.name} icon={p.icon} name={p.name} sub={p.how} />
          ))}
        </div>
      </Section>

      <Section title="Truck medals & patches — its own set">
        <p className="text-sm text-muted-text mb-3">
          Each asset earns its own awards, on its own stats. The truck runs on fuel
          economy and mileage.
        </p>
        <div className="grid sm:grid-cols-2 gap-x-6">
          {TRUCK_MEDAL_GUIDE.map((m) => (
            <AwardLine key={m.name} icon={m.icon} name={m.name} sub={m.tiers} />
          ))}
          {TRUCK_PATCH_GUIDE.map((p) => (
            <AwardLine key={p.name} icon={p.icon} name={p.name} sub={p.how} />
          ))}
        </div>
      </Section>

      <Section title="Trailer medals & patches — its own set">
        <p className="text-sm text-muted-text mb-3">
          The trailer has no engine, so it earns on the loads it carried: its 8%
          slice of net, the weight it hauled, and hub miles.
        </p>
        <div className="grid sm:grid-cols-2 gap-x-6">
          {TRAILER_MEDAL_GUIDE.map((m) => (
            <AwardLine key={m.name} icon={m.icon} name={m.name} sub={m.tiers} />
          ))}
          {TRAILER_PATCH_GUIDE.map((p) => (
            <AwardLine key={p.name} icon={p.icon} name={p.name} sub={p.how} />
          ))}
        </div>
      </Section>

      <div
        className="my-6 border-t"
        style={{ borderColor: "#22304a" }}
        aria-hidden="true"
      />
      <h2 className="font-condensed text-2xl mb-3" style={{ color: AMBER_HI }}>
        Agents
      </h2>

      <Section title="Agent ratings">
        <p className="text-sm text-muted-text mb-4">
          You set these by hand — your call on who to work with. They show as a
          medallion on every agent, highest first.
        </p>
        <div className="flex flex-col gap-3">
          {RATINGS.map(([r, desc]) => (
            <div key={r} className="flex items-center gap-4">
              <div className="w-32 shrink-0">
                <RatingMedallion rating={r} />
              </div>
              <p className="text-sm text-muted-text">{desc}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="The quarterly leaderboard">
        <p className="text-sm text-muted-text">
          Ratings are your opinion; this is the scoreboard. Every calendar quarter,
          your agents are ranked by the revenue on the loads they actually
          delivered. Two things fall out of it — trophies, and a career rank — and
          both stick with the agent for good.
        </p>
      </Section>

      <Section title="Trophies">
        <p className="text-sm text-muted-text mb-4">
          Awarded each quarter to the agents who ran at least 3 loads.
        </p>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-4">
            <span
              className="w-24 shrink-0 flex items-center gap-1.5 font-medium"
              style={{ color: AMBER_HI }}
            >
              <Trophy size={18} /> Gold
            </span>
            <p className="text-sm text-muted-text">
              Finished #1 in delivered revenue that quarter.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span
              className="w-24 shrink-0 flex items-center gap-1.5 font-medium"
              style={{ color: "#c3cad6" }}
            >
              <Trophy size={18} /> Silver
            </span>
            <p className="text-sm text-muted-text">Finished #2 that quarter.</p>
          </div>
        </div>
      </Section>

      <Section title="Career rank">
        <p className="text-sm text-muted-text mb-4">
          Boards and trophies roll up into a single rank — the starburst in the
          corner of the agent's card. It never clutters and only ever levels up,
          climbing bronze → silver → gold → the holographic{" "}
          <span className="text-light">Legend</span> foil at the very top.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {TIERS.map(([tier, desc]) => (
            <div key={tier} className="flex items-center gap-3">
              <PrestigeBurst tier={tier} size={54} />
              <div>
                <p
                  className="font-comic text-lg"
                  style={{ color: PRESTIGE_META[tier].fill }}
                >
                  {PRESTIGE_META[tier].label}
                </p>
                <p className="text-sm text-muted-text">{desc}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-text mt-4">
          The full record — every board, gold, and silver by quarter — lives on
          each agent's own page.
        </p>
      </Section>
    </div>
  </div>
);

export default GuidePage;
