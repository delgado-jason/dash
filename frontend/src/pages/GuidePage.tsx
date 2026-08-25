import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Trophy, ArrowRight } from "lucide-react";
import { RatingMedallion } from "@/components/agents/RatingMedallion";
import { VendorPips } from "@/components/vendors/VendorPips";
import {
  PRESTIGE_META,
} from "@/components/agents/PrestigeBadge";
import { Coin, type CoinMetal } from "@/components/forge/Coin";
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

// A stable anchor id from a heading's text. The table of contents and the
// section headings both run their text through this, so a TOC link always
// resolves to its section by construction — no hand-kept id list to drift.
const slug = (s: string): string =>
  s
    .replace(/&amp;/g, "and")
    .replace(/&nbsp;/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Where a metric's live number actually shows up, as a link the reader can
// follow straight from the formula to the figure.
interface Source {
  label: string;
  to: string;
}
const SourceChips = ({ sources }: { sources: Source[] }) => (
  <div className="flex flex-wrap gap-1.5 mt-3">
    <span className="text-[11px] text-muted-text self-center mr-0.5">
      Shown on
    </span>
    {sources.map((s) => (
      <Link
        key={s.to + s.label}
        to={s.to}
        className="text-[11px] px-2 py-0.5 rounded-full border transition-colors hover:bg-plate"
        style={{ borderColor: "#39435a", color: AMBER_HI }}
      >
        {s.label}
      </Link>
    ))}
  </div>
);

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

const Section = ({
  title,
  sources,
  children,
}: {
  title: string;
  sources?: Source[];
  children: ReactNode;
}) => (
  <section
    id={slug(title)}
    className="ds-panel ds-panel--default p-5 mb-4 scroll-mt-6"
  >
    <h2 className="font-condensed text-xl mb-3">{title}</h2>
    {children}
    {sources && sources.length > 0 && <SourceChips sources={sources} />}
  </section>
);

// One dashboard tab in the overview: its name, the question it answers, and what
// lives on it.
const TabLine = ({
  name,
  q,
  children,
}: {
  name: string;
  q: string;
  children: ReactNode;
}) => (
  <div className="rounded-md p-3" style={{ background: "#0d1119", border: "1px solid #22304a" }}>
    <p className="text-sm">
      <span className="font-condensed font-bold" style={{ color: AMBER_HI }}>{name}</span>
      <span className="text-muted-text"> — {q}</span>
    </p>
    <p className="text-xs text-muted-text mt-1">{children}</p>
  </div>
);

// One row in the award catalog: emblem + name + how to earn it.
const AwardLine = ({
  icon,
  name,
  sub,
}: {
  icon: string;
  name: string;
  sub: string;
}) => {
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
  sources,
  children,
}: {
  title: string;
  answers: string;
  sources?: Source[];
  children: ReactNode;
}) => (
  <section
    id={slug(title)}
    className="ds-panel ds-panel--default p-5 mb-4 scroll-mt-6"
  >
    <h3 className="font-condensed text-lg" style={{ color: AMBER_HI }}>
      {title}
    </h3>
    <p className="text-sm text-muted-text mt-0.5 mb-3">{answers}</p>
    {children}
    {sources && sources.length > 0 && <SourceChips sources={sources} />}
  </section>
);

// The formula, set apart so it reads as "the math."
const Formula = ({ children }: { children: ReactNode }) => (
  <div
    className="rounded-md px-3 py-2.5 text-sm font-condensed leading-relaxed"
    style={{
      background: "#0d1119",
      border: "1px solid #22304a",
      color: "#f5e6c8",
    }}
  >
    {children}
  </div>
);

const Eg = ({ children }: { children: ReactNode }) => (
  <p className="text-xs text-muted-text mt-2">
    <span style={{ color: AMBER }}>e.g.</span> {children}
  </p>
);

// A "don't confuse this with that" warning — for the places where a field you
// can type into is NOT the number the app reports.
const Caveat = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <div
    className="px-3 py-2 mt-3"
    style={{ background: "#2f2616", borderLeft: `2px solid ${AMBER}` }}
  >
    <p className="text-xs mb-1" style={{ color: AMBER_HI }}>
      {title}
    </p>
    <p className="text-xs text-muted-text leading-relaxed">{children}</p>
  </div>
);

const Why = ({ children }: { children: ReactNode }) => (
  <p className="text-sm text-muted-text mt-3">{children}</p>
);

// How much of each component of a load's rate you keep.
const KeepBar = ({
  label,
  pct,
  note,
}: {
  label: string;
  pct: number;
  note?: string;
}) => (
  <div className="flex items-center gap-3">
    <span className="w-28 shrink-0 text-sm">{label}</span>
    <div
      className="flex-1 h-3 rounded overflow-hidden"
      style={{ background: TRACK }}
    >
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
    <div
      className="flex h-3 rounded overflow-hidden"
      style={{ background: TRACK }}
    >
      <div style={{ width: "67%", background: AMBER, opacity: 0.55 }} />
      <div style={{ flex: 1, background: GREEN, opacity: 0.55 }} />
    </div>
    <div className="relative h-9 mt-1 text-xs text-muted-text">
      <span className="absolute left-0">
        walk-away
        <br />
        <span className="text-light">$4.34</span>
      </span>
      <span className="absolute left-[67%] -translate-x-1/2 text-center">
        target
        <br />
        <span className="text-light">$5.21</span>
      </span>
      <span className="absolute right-0 text-right">
        strong
        <br />
        <span className="text-light">$5.64</span>
      </span>
    </div>
    <div
      className="flex items-center gap-2 flex-wrap mt-2 pt-2 text-xs"
      style={{ borderTop: "0.5px solid rgba(255,255,255,0.07)" }}
    >
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-block rounded-full shrink-0"
          style={{ width: 8, height: 8, background: "#e05a3a" }}
        />
        <span className="text-light">Specialized</span>
      </span>
      <span className="text-[11px] text-muted-text">oversize · hazmat · heavy</span>
      <span className="ml-auto text-muted-text">
        target <span style={{ color: AMBER }}>$6.29</span> · strong{" "}
        <span style={{ color: "#4ade80" }}>$6.94</span>
      </span>
    </div>
  </div>
);

// A group heading that doubles as a scroll anchor, so the contents can jump to
// a whole section, not just a single metric.
const GroupHeading = ({ children }: { children: string }) => (
  <h2
    id={slug(children)}
    className="font-condensed text-2xl mb-3 mt-8 scroll-mt-6"
    style={{ color: AMBER_HI }}
  >
    {children}
  </h2>
);

// The contents. Titles are verbatim so slug() lines the links up with the
// section anchors. Keep this in step with the sections as the guide grows.
const NAV: { group: string; items: string[] }[] = [
  {
    group: "The dashboard",
    items: ["The tabbed dashboard — five views of your operation"],
  },
  {
    group: "The Foreman",
    items: ["The Foreman — who to call from where you'll be empty next"],
  },
  {
    group: "The money",
    items: [
      "Your net revenue — what you actually keep",
      "True cost per mile",
      "Break-even — the rate to book",
      "The rate ladder",
      "Load Scorer — Take It or Leave It",
      "Weekly & daily targets",
      "Market & Rates — reading the cycle",
      "Rate per mile (RPM)",
      "Lane rate — typical vs blended",
      "Outstanding loads — how long money sits",
      "Two-week cash — will you clear the drafts",
      "Six-month road — the rolling forecast",
      "Pretax margin — the real one",
      "Per diem — the meal-allowance deduction",
      "Deadhead",
      "Fuel economy (MPG)",
      "Latest tank — last fill-up scored",
      "Diesel price — you vs national",
      "Fuel vs revenue — is the surcharge covering your fuel?",
    ],
  },
  {
    group: "The dock — facilities, scheduling &amp; detention",
    items: [
      "Facilities — your shippers and receivers",
      "Appointment or window",
      "In / out times & dwell",
      "Detention — a decision, not an auto-flag",
      "TONU — the dead-run fee",
      "The loads table, by color",
      "Facility & agent scorecards",
    ],
  },
  {
    group: "The driver card",
    items: [
      "Bottleneck — your three profit levers",
      "This quarter — on track to beat last?",
      "Equipment mix — oversize &amp; heavy haul",
      "Hometime — days since you were home",
    ],
  },
  {
    group: "The truck",
    items: [
      "Utilization — how hard the truck runs",
      "Fuel economy — miles per gallon",
      "Cost to run per mile — what the truck costs you",
      "Revenue per mile — what each mile earns",
    ],
  },
  {
    group: "The award system",
    items: [
      "Four ways to win",
      "Driver medals — climb the tiers",
      "Driver patches — hard, and they stack",
      "Truck medals & patches — its own set",
      "Trailer medals & patches — its own set",
    ],
  },
  {
    group: "Agents",
    items: [
      "Agent ratings",
      "Reading the roster — the Go-to score",
      "The quarterly leaderboard",
      "Trophies",
      "Career rank",
    ],
  },
  {
    group: "Vendors",
    items: ["Vendor ratings", "Best per category", "Shop spend"],
  },
  {
    group: "Team &amp; roles",
    items: [
      "Adding a dispatcher",
      "What a dispatcher sees",
      "The Dispatch board",
      "Agents &amp; lanes are graded on gross",
      "The Dispatcher Card",
      "Dispatcher achievements — patches &amp; medals",
      "Dispatcher season &amp; trophies",
      "The Dispatch Forge",
    ],
  },
];

// Render a title the way it reads (turn the HTML entities back into glyphs).
const pretty = (s: string): string =>
  s.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");

// The table of contents. `variant="rail"` is the sticky desktop sidebar;
// `variant="block"` is the stacked version shown above the content on phones.
const GuideToc = ({
  query,
  onQuery,
  variant,
  className,
}: {
  query: string;
  onQuery: (v: string) => void;
  variant: "rail" | "block";
  className?: string;
}) => {
  const q = query.trim().toLowerCase();
  const groups = NAV.map((g) => ({
    ...g,
    items: q
      ? g.items.filter((it) => pretty(it).toLowerCase().includes(q))
      : g.items,
  })).filter((g) => g.items.length > 0 || (!q && true));

  return (
    <nav
      aria-label="Guide contents"
      className={className}
      style={
        variant === "rail" ? { maxHeight: "calc(100vh - 3rem)" } : undefined
      }
    >
      <div
        className={
          variant === "rail"
            ? "ds-panel ds-panel--default p-3 overflow-y-auto"
            : "ds-panel ds-panel--default p-3"
        }
        style={
          variant === "rail" ? { maxHeight: "calc(100vh - 3rem)" } : undefined
        }
      >
        <p className="text-[11px] tracking-wide text-muted-text px-1 mb-2">
          CONTENTS
        </p>
        <input
          type="text"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Filter metrics"
          aria-label="Filter the guide"
          className="w-full mb-2 px-2 py-1 text-xs rounded bg-steel border border-plate text-light placeholder:text-muted-text focus:outline-none focus:border-amber"
        />
        <ul className="space-y-0.5">
          {groups.map((g) => (
            <li key={g.group}>
              <a
                href={`#${slug(g.group)}`}
                className="block font-condensed text-sm px-1 pt-2 pb-0.5"
                style={{ color: AMBER_HI }}
              >
                {pretty(g.group)}
              </a>
              <ul>
                {g.items.map((it) => (
                  <li key={it}>
                    <a
                      href={`#${slug(it)}`}
                      className="block text-xs text-muted-text hover:text-light py-0.5 pl-3 pr-1 leading-snug"
                    >
                      {pretty(it)}
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {q && groups.length === 0 && (
            <li className="text-xs text-muted-text px-1 py-2">
              No metric matches "{query}".
            </li>
          )}
        </ul>
      </div>
    </nav>
  );
};

const GuidePage = () => {
  const [query, setQuery] = useState("");
  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <h1 className="text-3xl font-condensed mb-1">Guide</h1>
      <p className="text-muted-text text-sm mb-6 max-w-3xl">
        Every number in dash, and exactly how it's built — so you can check the
        math, not just trust it. The figures below are worked examples; your
        live numbers are on the dashboard and Expenses page.
      </p>

      <GuideToc
        query={query}
        onQuery={setQuery}
        variant="block"
        className="lg:hidden mb-6"
      />

      <div className="flex gap-8 items-start">
        <GuideToc
          query={query}
          onQuery={setQuery}
          variant="rail"
          className="hidden lg:block sticky top-6 w-60 shrink-0"
        />

        <main className="flex-1 min-w-0 max-w-3xl">
          <h2
            id={slug("The dashboard")}
            className="font-condensed text-2xl mb-3 scroll-mt-6"
            style={{ color: AMBER_HI }}
          >
            The dashboard
          </h2>

          <Section title="The tabbed dashboard — five views of your operation">
            <p className="text-sm text-muted-text mb-3">
              The dashboard is split into tabs, each answering one question at a
              glance. Pick a tab and it stays put — dash remembers where you left
              off next time you open it.
            </p>
            <div className="flex flex-col gap-2.5">
              <TabLine name="Pulse" q="How's my day going?">
                This pay week's earnings vs your target — with overdrive room past
                the target and your best week marked on the chart — your booking
                rate against your floor, and the Next rail: your next delivery,
                pickup, settlement day, and maintenance/compliance clocks in one
                list. The two most urgent alerts show, the rest fold behind a tap.
              </TabLine>
              <TabLine name="Money" q="Am I profitable?">
                Year-to-date income and two margins — operating, and your
                after-notes (owner's take) margin, which is the one graded
                against your goal since it's what's actually left after the truck,
                trailer, and loan notes. Plus the monthly P&amp;L, the margin
                trend, where the money goes by category, your realized profit per
                mile, and the notes tracker — how much of this month's notes are
                covered and the day you're on pace to clear them. (Delivered-but-
                unsettled money shows on Pulse as your next settlement — it clears
                every week.)
              </TabLine>
              <TabLine name="Lanes" q="Where does my freight run?">
                The U.S. map shaded by your $/mi (fire marks your best-paying
                markets), your top lanes by gross, and your load-type mix —
                oversize, flatbed, specialized. The 30/60/90 toggle sets both the
                window and how finely the map groups.
              </TabLine>
              <TabLine name="Agents" q="Who should I call?">
                Your bench plotted by rate × volume, who you're running with lately
                (by last worked), quarterly standings — this quarter live plus last
                quarter's top earners — revenue concentration (so no one agent owns
                too much of your book), and who's going cold.
              </TabLine>
              <TabLine name="Fleet" q="Is my rig ready to roll?">
                Your rig at a glance — utilization (how hard the truck runs), home
                time (days out), fuel economy, and what's due for service or
                compliance. Plus shop spend across the year, cost-to-run per mile,
                and a day-by-day heatmap of earning vs. home vs. idle.
              </TabLine>
            </div>
          </Section>

          <h2
            id={slug("The Foreman")}
            className="font-condensed text-2xl mb-3 mt-8 scroll-mt-6"
            style={{ color: AMBER_HI }}
          >
            The Foreman
          </h2>

          <Section title="The Foreman — who to call from where you'll be empty next">
            <p className="text-sm text-muted-text mb-3">
              The Foreman turns "who do we usually call around here?" into a ranked
              call list. It looks at where you'll be{" "}
              <span className="text-light">empty next</span>, then ranks the agents
              you've booked by how well each one fits your next load. It is a call
              list built from your own history —{" "}
              <span className="text-light">not a live load feed</span>: it can't know
              who has freight posted today, only who's your best bet to call from
              here.
            </p>

            <p className="text-sm font-condensed mb-1" style={{ color: AMBER_HI }}>
              Direct customers come first
            </p>
            <p className="text-sm text-muted-text mb-3">
              Agents split into two buckets:{" "}
              <span className="text-light">Direct</span> customers — an agent you've
              hit the same shipper or receiver 2+ times through (their own account,
              worth a relationship) — and <span className="text-light">Spot</span>{" "}
              market agents (load-board one-offs). Every direct customer ranks above
              every spot agent: a closer spot agent never outranks a direct
              customer, but it still shows below for a quick one-off when nothing
              direct fits. The bucket auto-updates as loads come in; you can pin an
              agent either way on the Agents page.
            </p>

            <p className="text-sm font-condensed mb-1" style={{ color: AMBER_HI }}>
              Where you'll be empty next
            </p>
            <p className="text-sm text-muted-text mb-3">
              The anchor is the destination of the furthest-out load you're already
              committed to (booked or in-transit) — you're covered until it drops.
              With nothing committed, you're already empty at your last delivery.
            </p>

            <p className="text-sm font-condensed mb-1" style={{ color: AMBER_HI }}>
              The three axes
            </p>
            <ul className="text-sm text-muted-text mb-3 space-y-1.5 list-disc pl-5">
              <li>
                <span className="text-light">Proximity</span> — straight-line miles
                from your empty-next point to the{" "}
                <span className="text-light">nearest</span> origin that agent has
                loaded you from (their closest origin, not their average — the
                question is "can they load me near here").
              </li>
              <li>
                <span className="text-light">Rate</span> — the agent's gross dollars
                per <span className="text-light">loaded</span> mile for a load type,
                measured against your own <span className="text-light">realized median
                rate for that type</span> (your flatbed rate runs far under your
                oversize rate, so the yardstick has to be per-type). Loaded-mile, the
                same basis as the Agents page, so an agent is never dinged for a
                deadhead they didn't cause.
              </li>
              <li>
                <span className="text-light">History</span> — loads you've run
                together, how recently, and dwell (money left sitting in unpaid
                detention).
              </li>
            </ul>

            <p className="text-sm font-condensed mb-1" style={{ color: AMBER_HI }}>
              Rank by
            </p>
            <p className="text-sm text-muted-text mb-3">
              <span className="text-light">Balanced</span> blends all three, weighting
              your relationship as heavily as proximity — you're building ties, not
              just chasing the closest freight.{" "}
              <span className="text-light">Closest</span> sorts by distance alone;{" "}
              <span className="text-light">Best rate</span> by the highest raw $/mi.
              The <span className="text-light">Looking for</span> selector narrows to a
              load type and benchmarks each agent against your median rate for that type.
            </p>
            <Formula>
              Balanced score = 0.35 × proximity + 0.30 × rate + 0.35 × relationship
            </Formula>

            <p className="text-sm text-muted-text mt-3">
              An agent you've run once shows as{" "}
              <span style={{ color: "#5dcaa5" }}>New · building</span> — not a
              low-confidence reject, but a relationship worth deepening. Distances are
              straight-line estimates (shown with a ~) and sharpen to real miles as the
              app geocodes each city quietly in the background; a city it can't place
              yet falls back to region-level rather than a fake number.
            </p>
          </Section>

          <h2
            id={slug("The money")}
            className="font-condensed text-2xl mb-3 mt-8 scroll-mt-6"
            style={{ color: AMBER_HI }}
          >
            The money
          </h2>

          <Metric
            title="Your net revenue — what you actually keep"
            answers="Every revenue figure in dash is your net take-home, not the full rate the customer paid."
            sources={[
              { label: "Dashboard", to: "/dashboard" },
              { label: "Loads", to: "/loads" },
            ]}
          >
            <Formula>
              net = linehaul × your&nbsp;linehaul&nbsp;% + fuel&nbsp;surcharge ×
              100% + each accessorial × its own rate
            </Formula>
            <div className="flex flex-col gap-2 mt-3">
              <KeepBar label="Linehaul" pct={73} />
              <KeepBar label="Fuel surcharge" pct={100} />
              <KeepBar label="Accessorials" pct={100} note="by type (0–100%)" />
            </div>
            <Why>
              You book the full customer rate, but your leased carrier keeps a
              cut. In this example you keep{" "}
              <span className="text-light">73% of linehaul</span>,{" "}
              <span className="text-light">100% of fuel surcharge</span>, and
              accessorials by type (tarp 100%, hazmat 73%, excess-value 0%) —
              every percentage is yours to set in{" "}
              <span className="text-light">Settings</span>. On your own
              authority you keep it all: set everything to 100%.
            </Why>
          </Metric>

          <Metric
            title="True cost per mile"
            answers="What it costs to roll one mile, everything in."
            sources={[
              { label: "Dashboard", to: "/dashboard" },
              { label: "Expenses", to: "/expenses" },
            ]}
          >
            <Formula>
              true cost = P&amp;L operating cost + monthly obligations (truck
              note, etc.)
              <br />
              cost per mile = true cost ÷ every mile you drove
            </Formula>
            <Eg>$23,600/mo ÷ ~7,450 miles ≈ $3.17 per mile.</Eg>
            <Why>
              Blended over your last{" "}
              <span className="text-light">3 complete months</span> (rolling ~90
              days) so one lumpy month — a big repair, say — doesn't swing it.
              It's over <span className="text-light">total</span> miles (loaded
              and empty), because every mile you drive costs you.
            </Why>
          </Metric>

          <Metric
            title="Break-even — the rate to book"
            answers="The gross rate per mile you have to book to cover your cost."
            sources={[
              { label: "Dashboard", to: "/dashboard" },
              { label: "Score a Load", to: "/score" },
            ]}
          >
            <Formula>
              break-even $/mi = cost per driven mile ÷ your keep %
            </Formula>
            <div className="flex items-center gap-2 flex-wrap my-3">
              <ChainBox top="$3.17" bottom="cost / mile" />
              <ArrowRight size={16} className="text-muted-text" />
              <ChainBox top="÷ 73%" bottom="your keep" />
              <ArrowRight size={16} className="text-muted-text" />
              <ChainBox top="$4.34" bottom="gross to book" />
            </div>
            <Why>
              Two haircuts, and they're different: you fold your{" "}
              <span className="text-light">deadhead</span> into the miles
              yourself (cost is spread over every mile you drive), and you only{" "}
              <span className="text-light">keep 73%</span> of what you book — so
              the rate to book is your cost-per-mile ÷ 0.73. Anything above{" "}
              <span className="text-light">$4.34</span> (with your empty miles
              counted) makes money. It's conservative: you keep 100% of fuel
              surcharge on top, so your real cushion is a bit bigger.
            </Why>
          </Metric>

          <Metric
            title="The rate ladder"
            answers="Where your booked rate lands against your targets."
            sources={[{ label: "Dashboard", to: "/dashboard" }]}
          >
            <MiniLadder />
            <Formula>
              walk-away = break-even · minimum / target / strong = break-even ×
              (1 + your tier %)
            </Formula>
            <Why>
              There are <span className="text-light">two tier sets</span>, both
              editable in Settings and both shown on the ladder above.{" "}
              <span className="text-light">Standard</span> (seeded +10 / 20 / 30%)
              is your everyday freight and carries the full bar plus your rate
              marker. <span className="text-light">Specialized</span> (+35 / 45 /
              60%) is the higher bar for oversize, hazmat, and heavy-haul loads —
              they command a real premium — shown as the compact row beneath (same
              walk-away, higher target and strong). The marker is your actual gross
              rate per mile, against the Standard bar.
            </Why>
          </Metric>

          <Metric
            title="Load Scorer — Take It or Leave It"
            answers="Enter a rate, pickup, and delivery — the miles come back routed, deadhead measured from where your truck sits — for an instant verdict on whether the load's worth taking."
            sources={[{ label: "Score a Load", to: "/score" }]}
          >
            <Formula>
              all-in $/mi = rate ÷ (loaded + deadhead) · vs your break-even per
              driven mile
            </Formula>
            <Eg>
              $2,900 for 460 loaded + 80 deadhead = 540 miles you drive →{" "}
              <span className="text-light">$5.37/mi</span>. The deadhead is
              baked in on purpose — it's the empty cost agents leave out.
            </Eg>
            <Why>
              The break-even here is per{" "}
              <span className="text-light">driven</span> mile (your cost/mile ÷
              your Landstar take), so it's apples-to-apples with the all-in rate
              — a lower number than the dashboard's per-loaded-mile ladder, by
              design. The verdict maps to whichever tier set fits the load:{" "}
              <span style={{ color: "#e24b4a" }}>SCRAP</span> below break-even,{" "}
              <span style={{ color: "#f5b03a" }}>THIN</span> under target,{" "}
              <span style={{ color: "#5dcaa5" }}>SOLID</span> at target,{" "}
              <span style={{ color: "#ffcf7a" }}>PRIME</span> at strong. A legal
              load hits those at your Standard tiers (+20 / +30%); an
              oversize, hazmat, or heavy load has to reach the Specialized ones
              (+45 / +60%). A line under the verdict names which set graded it.
            </Why>
            <Why>
              A weak verdict now shows <span className="text-light">why</span> — the
              freight's own rate (per <span className="text-light">loaded</span>{" "}
              mile) beside the deadhead's share of the run. So a good load you're just
              far from reads as "good freight, bad position," not a flat pass: the
              deadhead is the knock, not the load. Add the{" "}
              <span className="text-light">agent</span> (by 3-letter code or name) and
              it shows your history with them — loads together, their rate, dwell — so
              a keeper's relationship weighs in at booking time. An agent you haven't
              booked flags <span className="text-light">New</span>, and isn't saved
              until you actually run a load with them.
            </Why>
            <Why>
              It also scores the <span className="text-light">destination</span> — where
              the load leaves you — off your own outbound history: how well freight OUT
              of that market has paid you, how much of it there's been, and how many
              agents source it, graded{" "}
              <span style={{ color: "#5dcaa5" }}>STRONG</span> /{" "}
              <span className="text-light">FAIR</span> /{" "}
              <span style={{ color: "#e8940a" }}>SOFT</span> / thin against your overall
              norm. So a fair-paying load that drops you somewhere you can't reload reads
              as a <span className="text-light">reposition cost</span>, with your strong
              markets named for contrast and — when the city's geocoded — the distance to
              your nearest strong freight. A line up top, <span className="text-light">the
              call</span>, weighs the rate, the destination, and the agent into one
              honest recommendation. Thin markets are flagged, not guessed; it sharpens
              as you log loads.
            </Why>
            <Why>
              Miles come from truck routing (HERE), not a straight line — the
              deadhead starts from your{" "}
              <span className="text-light">last-known location</span> (your last
              delivery, fuel stop, or trip). Enter the load's dimensions and it
              flags <span className="text-light">legal vs oversize</span> and
              routes an oversize load around the clearances it can't make, so the
              miles are honest. Oversize and overweight are read straight from the
              dimensions; hazmat isn't dimensional, so there's a{" "}
              <span className="text-light">Hazmat toggle</span> — flip it and the
              load is graded on the Specialized tiers too. It's an estimate for
              the decision; the odometer is still truth once you run it. Every
              mile field stays editable if you'd rather type your own.
            </Why>
            <Why>
              It also shows this route's{" "}
              <span className="text-light">estimated tolls</span> — a reminder to
              bill them as an accessorial (Landstar pays 100%), not eat them. And
              when a load comes in under target, it lays out{" "}
              <span className="text-light">what to ask the agent</span>: the floor
              (break-even), the SOLID rate, and the PRIME rate for that load's
              miles — so you know the room to bargain.
            </Why>
          </Metric>

          <Metric
            title="Weekly & daily targets"
            answers="The gross dollars to book each week and day."
            sources={[{ label: "Dashboard", to: "/dashboard" }]}
          >
            <Formula>
              weekly break-even = (true cost ÷ your keep) ÷ 4.33 weeks
              <br />
              weekly target = weekly break-even ÷ (1 − your margin goal)
            </Formula>
            <Why>
              A total-dollars goal, not a per-mile one: cover your true monthly
              cost, spread over the pay week, then lift it to your{" "}
              <span className="text-light">margin goal</span> (profit ÷ revenue,
              set in Settings). It's the line the grind meter and pace bar grade
              you against, in gross booking dollars.
            </Why>
            <Why>
              Two things it does <span className="text-light">not</span> ride.
              Your <span className="text-light">rate tiers</span> — those judge a
              load's per-mile rate, a different question. And your{" "}
              <span className="text-light">miles</span> — drive more and your
              per-mile targets drop, but you cover more miles, so the weekly
              dollars you need don't move. Only your cost and your margin goal
              change this number.
            </Why>
          </Metric>

          <Metric
            title="Market & Rates — reading the cycle"
            answers="Every delivered load plotted by what it paid per driven mile, over time — so you can see the freight market turn and tell whether your rate tiers still fit it."
            sources={[{ label: "Market", to: "/market" }]}
          >
            <Why>
              The <span className="text-light">scatter</span> drops every load on
              a timeline by its gross rate per driven mile, colored by type, with
              your break-even and tier lines drawn across it. A soft market shows
              up as a cluster sinking toward — or under — the break-even line
              before you'd feel it load by load.
            </Why>
            <Why>
              The <span className="text-light">barometer</span> is your own median
              rate per driven mile by month — your personal read on where the
              market is — with the national{" "}
              <span className="text-light">PPI for specialized freight trucking</span>{" "}
              (from the Fed's FRED data) overlaid on a second axis. Your own rate
              lags; when that macro line turns down first, it's an early nudge the
              market's softening before your own loads show it. The{" "}
              <span className="text-light">tier gauge</span> then
              asks the useful question: where do your tiers land in the last 90
              days? A target sitting at the 40th percentile means the market
              clears it easily (hot — room to raise); one at the 90th means it's
              barely gettable (soft — trim). That turns "when do I adjust my
              tiers" into a number you read instead of a gut call — and it now
              factors the macro trend, so it won't tell you to raise into a market
              that's already turning down.
            </Why>
            <Why>
              <span className="text-light">You vs. the market</span> (under the
              barometer) compares your rate's move to the freight index's over the
              last six months. If the market's up and you're flat, that's money on
              the table you can chase — lanes, agents, negotiation. If you're both
              down, it's the cycle, not you. And a small{" "}
              <span className="text-light">freight-market chip</span> rides on the
              dashboard header so you catch the trend at a glance. All of it is a
              national read — your own lane heat still comes from your own loads.
            </Why>
          </Metric>

          <Metric
            title="Market playbook — the move to make"
            answers="Reads which way the freight index is turning and where your recent rate sits against your own rungs, then gives one clear call per tier — raise, hold, protect, or cut costs."
            sources={[{ label: "Market", to: "/market" }]}
          >
            <Why>
              There's no national oversize spot price to book against, so the
              playbook doesn't invent one. It reads two things you already trust:
              which way the{" "}
              <span className="text-light">FRED freight index</span> is pointing
              (firming, steady, or softening) and where your own{" "}
              <span className="text-light">recent median rate</span> sits against
              your rungs — break-even, floor, target, strong. From those it gives
              one move per tier instead of a wall of numbers.
            </Why>
            <Why>
              Firming and you're under your strong rung →{" "}
              <span className="text-light">Raise</span>, with the percent to get
              there. Steady and under target → room to push. Softening →{" "}
              <span className="text-light">Hold and protect your floor</span>,
              showing how much cushion you've got before the edge.
            </Why>
            <Why>
              A tier can sit <span className="text-light">below your cost floor</span>{" "}
              (break-even) while the business is still very profitable — your cheap
              standard freight carried by your oversize work. That's flagged as a
              nudge to lift that tier or fill the miles with richer freight, not an
              alarm — it isn't losing you money. The{" "}
              <span className="text-light">Cut costs</span> call is reserved for
              when your <span className="text-light">whole operation</span> books
              below break-even (your blended rate across every load can't cover
              cost after Landstar's cut) — that's when cutting costs, not chasing
              rate, is the lever.
            </Why>
            <Why>
              When the whole operation is under, a <span className="text-light">cut
              plan</span> appears under the playbook — built from{" "}
              <span className="text-light">your own books</span>, not a canned list.
              It closes the monthly gap least-painful first: overspend trimmed back to
              normal, then discretionary overhead, a deferred slice of non-safety
              repairs, a small fuel-efficiency slice — and only reaches for your pay as
              a last resort, saying so plainly when a gap runs deeper than the safe
              cuts. Insurance, loans and interest, permits, tolls, and taxes are never
              touched. You set how each category is treated in{" "}
              <span className="text-light">Settings → Cost-cut tiers</span>; the plan
              obeys your choices.
            </Why>
            <Why>
              Each tier lists its rungs high to low with a{" "}
              <span className="text-light">You're booking</span> marker dropped in
              where your rate lands, so the call is something you can see, not
              decode. Standard flatbed and specialized / oversize each get their
              own read off their own ladder. It rides the top of the Market page,
              and — like the barometer and gauge — everything is your gross rate
              per driven mile, so nothing's compared across bases.
            </Why>
          </Metric>

          <Metric
            title="Market suggestions — the right market on load entry"
            answers="As you enter a load, the market field suggests the market you've used before for that shipper/receiver or city — so the same place never gets tagged two different ways."
            sources={[{ label: "Loads", to: "/loads" }]}
          >
            <Why>
              A market is a <span className="text-light">location</span>, not a
              name — every stop within 75 miles of a freight hub belongs to that
              hub's market. When the same shipper or city gets tagged to two
              different markets, your lane and RPM analysis quietly splits in
              half. The suggestion chip stops that at the source: it reads your
              own history and offers the market you've used before.
            </Why>
            <Why>
              It climbs from surest to loosest and shows the first hit:{" "}
              <span className="text-light">same shipper or receiver</span> you've
              hauled before — matched to the state, so a national plant with sites
              in two states picks the right one — then the{" "}
              <span className="text-light">same city</span>, then{" "}
              <span className="text-light">a market named for that city</span>{" "}
              (type "Atlanta" and it offers your Atlanta Market, even though your
              loads run from the towns around it), then the{" "}
              <span className="text-light">nearest city you've already mapped</span>{" "}
              within 75 miles, then the{" "}
              <span className="text-light">nearest major freight hub</span> within
              75 miles, and — for a genuinely remote spot — a{" "}
              <span className="text-light">regional name</span> like "Western Texas
              Market." Tap <span className="text-light">Use</span> to accept a
              market you already have; when the pick is a hub or region you haven't
              logged yet, the chip reads{" "}
              <span className="text-light">Create &amp; use</span> and mints that
              market (canonically named) for you. Either way it's a suggestion,
              never an auto-fill — the call stays yours.
            </Why>
          </Metric>

          <Metric
            title="Rate per mile (RPM)"
            answers="Your net rate on the miles you actually get paid for."
            sources={[{ label: "Dashboard", to: "/dashboard" }]}
          >
            <Formula>RPM = net revenue ÷ loaded miles</Formula>
            <Why>
              Loaded miles, not total — because the customer pays you for the
              haul, not your empty run to the pickup.
            </Why>
          </Metric>

          <Metric
            title="Lane rate — typical vs blended"
            answers="On the Lanes page each rate is the typical load, so one fluke haul can't crown a lane it can't repeat."
            sources={[{ label: "Lanes", to: "/lanes" }]}
          >
            <Formula>
              typical $/mi = median of each load's rate · blended = gross ÷ all
              loaded miles
            </Formula>
            <Eg>
              Five loads near $2.10 and one short oversize at $6.00 → blended
              reads $2.72, but{" "}
              <span className="text-light">typical is $2.10</span> — the number
              you'll actually see next time. Lanes rank on typical; blended
              rides underneath.
            </Eg>
            <Why>
              A lane with only a handful of loads is easily skewed by a single
              high-accessorial run. The median asks "what does a normal load
              here pay," which is the honest basis for deciding where to book.
            </Why>
            <Why>
              The <span className="text-light">map</span> shades by your own
              median $/mi (toggle to volume for load count) — thin areas dim so
              one fluke doesn't light one up, and a flame marks your best-paying
              spots. Its <span className="text-light">detail follows the tab</span>:
              30d groups the country into a few big macro-regions, 60d into
              freight regions, 90d down to individual states — coarser when the
              window's sparse so it still reads, finer once there's enough data to
              trust. <span className="text-light">Click any area</span> to see the
              agents you've booked out of it (rate, volume, on-time, each linking
              to their page) and your top lanes from it — all your own history.
            </Why>
          </Metric>

          <Metric
            title="Outstanding loads — how long money sits"
            answers="The headline aging is the typical unpaid load, with the oldest called out separately."
            sources={[
              { label: "Dashboard", to: "/dashboard" },
              { label: "Loads", to: "/loads" },
            ]}
          >
            <Formula>median days outstanding · oldest days outstanding</Formula>
            <Eg>
              Loads out 12, 18, and 61 days →{" "}
              <span className="text-light">median 18d</span>, oldest 61d. A mean
              would say 30d and bury the fact that one disputed invoice is the
              real problem.
            </Eg>
            <Why>
              One stuck invoice shouldn't make routine collections look slow.
              The median shows the normal pace; the oldest surfaces the
              exception instead of hiding it.
            </Why>
          </Metric>

          <Metric
            title="Two-week cash — will you clear the drafts"
            answers="Fourteen days of real money: every bill on its draft day, settlements on their Wednesdays, and whether the ending stays above your float."
            sources={[{ label: "Cash Flow", to: "/cashflow" }]}
          >
            <Formula>
              ending = beginning + settlements − payroll − loan/lease −
              insurance − other
            </Formula>
            <Why>
              Week 1 begins at your latest Friday snapshot’s{" "}
              <span className="text-light">ops balance</span> (tap to override);
              week 2 begins where week 1 ends. Bills draft their{" "}
              <span className="text-light">full payment</span> on their real day
              of the month. Settlements prefer <span className="text-light">real
              loads</span>: anything not yet paid lands on the first Wednesday
              after its delivery day (delivered Tuesday pays tomorrow; delivered
              Wednesday waits a week). No loads booked into a week yet → the
              weekly-revenue fallback, and the chip says which one you’re
              looking at. The ending turns red under the plan’s float — the
              same line the sweep math uses on Status.
            </Why>
          </Metric>

          <Metric
            title="Six-month road — the rolling forecast"
            answers="Your last six closed months (from the QBO archive) rolled six months forward, home-time dips included."
            sources={[{ label: "Cash Flow", to: "/cashflow" }]}
          >
            <Formula>
              net income = 6-month average − (weeks off × weekly revenue)
              <br />
              net change = (net income + depreciation) + financing floor − taxes
            </Formula>
            <Why>
              Actual months come from PASTE MONTHS — rows copied straight off
              the QBO exports, each checked (<span className="text-light">ending
              = beginning + change</span>) before the archive takes it; the
              archive is permanent and re-pasting a month updates it. Forecast
              months (marked ◦, dashed on the chart) chain from the last actual
              ending. Depreciation is <span className="text-light">inside</span>{" "}
              net income and added back as non-cash — one pair, never
              double-counted. Set weeks off on any forecast month (November’s
              baby week ships marked). The earmark line shows{" "}
              <span className="text-light">true spendable</span>: ending minus
              the tax catch-up you owe.
            </Why>
          </Metric>

          <Metric
            title="Pretax margin — the real one"
            answers="Net income ÷ total income per closed month — honest now that depreciation sits in the P&L."
            sources={[{ label: "Cash Flow", to: "/cashflow" }]}
          >
            <Formula>pretax margin = net income ÷ total income</Formula>
            <Why>
              Before depreciation was on the books, any margin the app showed
              ran fat by the truck’s wear. The Cash Flow table shows it per
              month and the answering line carries the YTD figure — these come
              from your accountant-grade QBO numbers, not the app’s load math,
              so they’re the ones to quote. The driver card’s{" "}
              <span className="text-light">margin lever</span> grades this same
              number (pooled over the last three closed months), so the
              bottleneck diagnosis runs on real books too.
            </Why>
          </Metric>

          <Metric
            title="Per diem — the meal-allowance deduction"
            answers="Your days out, turned into the M&IE tax deduction. Unmarked days count as full days out — you only mark home time and half days."
            sources={[{ label: "Per Diem", to: "/per-diem" }]}
          >
            <Formula>
              (full days × rate + half days × 75% × rate) × 80% deductible
            </Formula>
            <Eg>
              A week out = 5 full days + 2 half days (the days you left and got
              home). Each day away overnight counts; the departure and return
              days are 75%.
            </Eg>
            <Why>
              As a DOT hours-of-service driver you deduct{" "}
              <span className="text-light">80%</span> of the IRS special rate
              (vs 50% for everyone else). The rate updates each October — set it
              and the deductible on the Settings page. The default assumes the
              life: from <span className="text-light">Aug 18, 2026</span> on, an
              unmarked day counts as a <span className="text-light">full day
              out</span> automatically — tap a day only to mark it half
              (departure/return), home, or back to automatic. Marking home time
              matters twice: it keeps the deduction honest AND it drives the
              hometime warning and the rig card's home/idle split. Days before
              the flip kept the old rules — home unless a delivered load covered
              them (shown hollow to confirm) or you marked them — so the history
              you entered under those rules didn't silently rewrite itself.
            </Why>
          </Metric>

          <Metric
            title="Deadhead"
            answers="The share of your miles that ran empty."
            sources={[
              { label: "Dashboard", to: "/dashboard" },
              { label: "Loads", to: "/loads" },
            ]}
          >
            <Formula>
              total miles = Σ (odometer end − odometer start)
              <br />
              empty miles = total miles − Σ loaded miles
              <br />
              <span style={{ color: AMBER_HI }}>
                deadhead % = empty miles ÷ total miles
              </span>
            </Formula>
            <Eg>
              July: odometer windows across delivered loads and trips total{" "}
              <span className="text-light">7,060 mi</span>; loaded miles total{" "}
              <span className="text-light">4,934 mi</span>. Empty = 2,126 →{" "}
              <span className="text-light">30.1%</span> deadhead.
            </Eg>
            <Caveat title="Not the “Deadhead Miles” field on the load form">
              That field is a hand-entered{" "}
              <span className="text-light">planning estimate</span>. Its job is
              estimating fuel for a run and scoring a load before you book it —
              where no odometer reading exists yet. Actual deadhead always comes
              from odometer deltas, because those capture every mile you really
              drove: detours, fuel stops, repositioning. Measured against your
              own data, the field understates by roughly 40% — Apr–Jun it read
              5,274 empty miles when the odometer says 7,378.
            </Caveat>
            <Why>
              Non-revenue trips (running home, to the shop) count as 100% empty
              — their whole odometer window is deadhead. Lower is better; every
              empty mile is cost with no revenue against it. Logging a trip's{" "}
              <span className="text-light">start and end city</span> keeps the
              truck's last-known location current, so the next trip prefills
              where the truck actually sits — loads and fuel already stamp it,
              trips were the blind spot.
            </Why>
          </Metric>

          <Metric
            title="Fuel economy (MPG)"
            answers="Real MPG, measured tank to tank — not the dash estimate."
            sources={[
              { label: "Fuel", to: "/fuel-entries" },
              { label: "Dashboard", to: "/dashboard" },
            ]}
          >
            <Formula>
              MPG = miles between full fills ÷ every gallon added in that
              stretch
            </Formula>
            <Why>
              A fill of <span className="text-light">120+ gallons</span> is a
              full tank; smaller top-offs roll into the next full. Measuring
              full-to-full is why it's honest — actual pump gallons against
              actual odometer miles.
            </Why>
          </Metric>

          <Metric
            title="Latest tank — last fill-up scored"
            answers="How your most recent full tank did against your own history."
            sources={[{ label: "Fuel", to: "/fuel-entries" }]}
          >
            <Why>
              The card at the top of the Fuel page scores your latest full tank:{" "}
              <span className="text-light">MPG</span> against your lifetime
              average (with vs-last-tank as a side note),{" "}
              <span className="text-light">fuel cost per mile</span> — this
              tank's $/gal ÷ MPG — against your{" "}
              <span className="text-light">90-day average</span> (it needs at
              least two recent tanks; one tank alone has nothing honest to
              compare against), and the tank's{" "}
              <span className="text-light">$/gal versus the national price</span>.
              Green is better, red is worse. It leans on your{" "}
              <span className="text-light">average</span> rather than just the
              last tank on purpose, so one heavy oversize run doesn't read as a
              slump. Beat your best MPG and it stamps a{" "}
              <span style={{ color: "#f5a623" }}>NEW BEST</span> (with a sound);
              string together tanks at or above your average and it tallies the
              streak.
            </Why>
          </Metric>

          <Metric
            title="Diesel price — you vs national"
            answers="Are you buying fuel below the national average, month over month?"
            sources={[{ label: "Fuel", to: "/fuel-entries" }]}
          >
            <Formula>
              your $/gal (month) = Σ (gallons × price paid) ÷ Σ gallons
              <br />
              national $/gal (month) = average of the EIA weekly retail prices
            </Formula>
            <Why>
              The Fuel page charts two monthly lines: your{" "}
              <span style={{ color: "#f5b03a" }}>
                gallon-weighted average $/gal
              </span>{" "}
              from the fuel log, against the{" "}
              <span style={{ color: "#8fb9ff" }}>
                national retail diesel price
              </span>{" "}
              (the U.S. EIA weekly number, rolled up to monthly). Buying under
              the national line means you're routing fuel stops well.
            </Why>
          </Metric>

          <Metric
            title="Fuel vs revenue — is the surcharge covering your fuel?"
            answers="Two reads on your fuel each month: what slice of your net it eats, and whether the fuel surcharge you collect still pays for it."
            sources={[{ label: "Fuel", to: "/fuel-entries" }]}
          >
            <Formula>
              fuel · % of net = fuel spend ÷ net revenue
              <br />
              <span style={{ color: AMBER_HI }}>
                surcharge covers = fuel surcharge collected ÷ fuel spend
              </span>
            </Formula>
            <Eg>
              July: $4,080 fuel on $23,883 net ={" "}
              <span className="text-light">17%</span>. Surcharge collected was
              $2,857, so it covered <span className="text-light">70%</span> of
              the fuel — the missing $1,223 came out of linehaul.
            </Eg>
            <Why>
              It's measured against <span className="text-light">net</span>, not
              gross, because you pay for fuel out of what your business actually
              keeps — after Landstar's cut — not the full customer rate. (Gross
              would read a flattering 13%; the honest number is 17%.) You keep
              100% of the fuel surcharge, so it's meant to offset diesel: when{" "}
              <span className="text-light">surcharge covers ≥ 100%</span> the
              freight paid for its own fuel; under 100%, the gap eats into your
              linehaul. It's been slipping — the surcharge fell while diesel
              held — which is worth watching when you price a load. Only months
              with logged fuel are counted, so a month you haven't entered fills
              for never shows a false 0%.
            </Why>
          </Metric>

          <GroupHeading>
            The dock — facilities, scheduling &amp; detention
          </GroupHeading>

          <Metric
            title="Facilities — your shippers and receivers"
            answers="Every stop is a saved place, kept apart by location so the many Walmarts never blur into one."
          >
            <Why>
              On a load, search your existing facilities as you type and pick
              one — that's what keeps the data clean. A{" "}
              <span className="text-light">business</span> is known by its name;
              a <span className="text-light">job site</span> has no company
              name, so it's known by its address. If two of the same place slip
              in (ABC Manufacturing vs ABC Manufacturing Inc), the Facilities
              page flags them under "Possible duplicates" so you can merge them
              into one.
            </Why>
          </Metric>

          <Metric
            title="Appointment or window"
            answers="Each stop gets a scheduled time — a set appointment or a delivery window."
          >
            <Formula>
              appointment = one time · window = a start–end range
            </Formula>
            <Eg>
              On the load form, leave the "to" blank for a set appointment
              (9:00), or fill it for a window (6:00–10:00,
              first-come-first-served).
            </Eg>
            <Why>
              Once you also log when you arrived, the stop shows an on-time
              badge: <span className="text-light">on time</span>,{" "}
              <span className="text-light">late</span>, or{" "}
              <span className="text-light">waited</span> (you beat the window
              open).
            </Why>
          </Metric>

          <Metric
            title="In / out times & dwell"
            answers="Log when you arrived and left each stop; dwell is how long you sat."
          >
            <Formula>dwell = departed − arrived</Formula>
            <Eg>
              Arrived 8:30a, left 10:45a →{" "}
              <span className="text-light">2h 15m</span> at the dock. Overnight
              stays are handled.
            </Eg>
          </Metric>

          <Metric
            title="Detention — a decision, not an auto-flag"
            answers="When a stop holds you past free time, the load recommends asking for detention — it only becomes 'owed' once you confirm the shipper is paying."
            sources={[
              { label: "Loads", to: "/loads" },
              { label: "Agents", to: "/agents" },
            ]}
          >
            <Formula>
              free time ends at (appointment / window END) + your free hours
              <br />
              <span style={{ color: AMBER_HI }}>
                detention = time released past that
              </span>
            </Formula>
            <Eg>
              8:00 appointment, 3h free → clock runs out at 11:00; released
              12:20 = <span className="text-light">1h 20m</span>. A window
              8:00–11:00 runs out at 2:00 (3h past the window's end).
            </Eg>
            <Why>
              The clock starts at the{" "}
              <span className="text-light">appointment</span> (window END if
              it's a window), not when you arrived — so showing up early never
              earns detention. Whether it actually pays is the shipper's call,
              so the app doesn't auto-flag it: past free time a load shows a{" "}
              <span className="text-light">"Possible detention"</span> nudge (a
              faint "det?" in the loads table). Clear it with the agent, then
              hit <span className="text-light">Detention will be paid</span> —
              now it's owed and the row highlights — or{" "}
              <span className="text-light">No detention</span> to dismiss it.{" "}
              <span className="text-light">Mark detention paid</span> clears it
              once collected. Set your free hours on Settings (you give 3). Each
              agent's page shows{" "}
              <span className="text-light">
                detention claimable vs collected
              </span>
              , so you can spot the ones whose freight holds you up and never
              pays.
            </Why>
          </Metric>

          <Metric
            title="TONU — the dead-run fee"
            answers="A truck-ordered-not-used load still owes you a fee."
          >
            <Why>
              A TONU flags red until you collect it. Mark it{" "}
              <span className="text-light">TONU paid</span> the same way you
              clear detention.
            </Why>
          </Metric>

          <Section title="The loads table, by color">
            <p className="text-sm text-muted-text mb-2">
              A left bar and row tint tell you what needs action, worst first:
            </p>
            <div className="text-sm flex flex-col gap-1.5">
              <p>
                <span style={{ color: "#3fb950" }}>● Green</span> — in transit.
                These lift into an "On the road" group up top, so what's rolling
                is always in view.
              </p>
              <p>
                <span style={{ color: "#e8940a" }}>● Amber</span> — detention
                owed &amp; unpaid (with a "DET" chip).
              </p>
              <p>
                <span style={{ color: "#e24b4a" }}>● Red</span> — a TONU fee
                owed &amp; unpaid.
              </p>
            </div>
            <p className="text-sm text-muted-text mt-2">
              Amber and red clear to a muted "paid" chip once you mark them.
              Filter the table by <span className="text-light">TONU</span> or{" "}
              <span className="text-light">Detention</span> to work through
              what's owed.
            </p>
          </Section>

          <Section title="Facility & agent scorecards">
            <p className="text-sm text-muted-text">
              As your stop times pile up, each facility and agent grows a
              scorecard — <span className="text-light">typical dwell</span> (the
              median, so one bad day doesn't skew it),{" "}
              <span className="text-light">on-time %</span>, and how often loads
              there ran into detention. It needs at least three timed stops
              before it shows, so it fills in over a few weeks — that's how you
              learn which docks eat your day and which agents' freight is worth
              the rate.
            </p>
          </Section>

          <GroupHeading>The driver card</GroupHeading>

          <Metric
            title="Bottleneck — your three profit levers"
            answers="Your season net breaks into Rate × Utilization × Margin. The card grades all three and names the weakest — the one holding you back."
            sources={[{ label: "Driver card", to: "/drivers" }]}
          >
            <Formula>
              net ≈ Rate × Utilization × Margin · bottleneck = the weakest lever
            </Formula>
            <Why>
              Each lever grades{" "}
              <span className="text-light">
                Below → Minimum → Target → Strong
              </span>
              : <span className="text-light">Rate</span> against your break-even
              ladder, <span className="text-light">Utilization</span> against
              the 70/80/85% benchmark, and{" "}
              <span className="text-light">Pretax margin</span> against your
              margin tiers — read from your{" "}
              <span className="text-light">QBO books</span> (the last three
              closed months on the Cash Flow archive, depreciation included),
              because the accountant-grade number is the one to trust. The tile
              names its basis; until the archive has months it falls back to
              the app's season estimate, labeled. They mask each other — a
              great rate with the truck sitting still nets mediocre — so the
              card names whichever is lagging and what to do about it. When all
              three reach Target, it reads{" "}
              <span style={{ color: "#4ade80" }}>Firing on all cylinders</span>.
            </Why>
          </Metric>

          <Metric
            title="This quarter — on track to beat last?"
            answers="Whether the quarter you're in is pacing ahead of or behind the last one — projected, not just the raw running total."
            sources={[{ label: "Driver card", to: "/drivers" }]}
          >
            <Formula>
              projected finish = last quarter's final × (this quarter so far ÷
              last quarter by the same day)
            </Formula>
            <Why>
              A season is a calendar quarter (Q1 Jan–Mar … Q4 Oct–Dec). The{" "}
              <span className="text-light">This Quarter</span> card paces the one
              you're in against the last complete one — but not by flat day-math,
              because freight isn't earned evenly. It compares where you sit now
              to where you sat by the{" "}
              <span className="text-light">same day of last quarter</span> and
              projects the finish by scaling last quarter's final by that ratio.
              Ahead of pace →{" "}
              <span style={{ color: "#4ade80" }}>on track to beat</span>; behind →{" "}
              <span style={{ color: "#f87171" }}>on track to finish under</span>.
              It paces your{" "}
              <span className="text-light">net from delivered loads</span> (which
              updates in real time), not the P&amp;L profit (which lags a monthly
              upload) — and for the first couple weeks it reads{" "}
              <span className="text-light">"too early to call"</span> rather than
              swing on a single big load. Because it's summed straight from your
              loads, these figures won't always match the{" "}
              <span className="text-light">Net revenue</span> in{" "}
              <span className="text-light">Last Season</span> — that number is
              your monthly P&amp;L income, so any month you haven't entered yet
              (or income booked under a different month than the load delivered)
              will move the two apart.
            </Why>
          </Metric>

          <Metric
            title="Equipment mix — oversize &amp; heavy haul"
            answers="How much of your delivered work is oversize, and separately, heavy haul. Clear a high bar in either and the card names you a specialist."
            sources={[{ label: "Driver card", to: "/drivers" }]}
          >
            <Formula>loads of that type ÷ your delivered loads</Formula>
            <Eg>
              12 oversize of 48 delivered →{" "}
              <span className="text-light">25%</span>. The specialist badge
              lights at{" "}
              <span className="text-light">40% and at least 5 loads</span>.
            </Eg>
            <Why>
              Oversize and heavy haul are different disciplines — different
              equipment, permits, and skill — so each gets its own strip and its
              own badge. A strip appears once you've delivered{" "}
              <span className="text-light">10+ loads</span> of that type, so a
              one-off doesn't earn a card. Standard and hazmat loads aren't
              counted toward either.
            </Why>
          </Metric>

          <Metric
            title="Hometime — days since you were home"
            answers="Days since your most recent home day. Past your threshold, the card flags it so a long stretch out doesn't sneak up on you."
            sources={[
              { label: "Dashboard", to: "/dashboard" },
              { label: "Driver card", to: "/drivers" },
            ]}
          >
            <Formula>
              today − your last home day · flag when it crosses your threshold
            </Formula>
            <Eg>
              Home June 27, today July 15 →{" "}
              <span className="text-light">18 days out</span>. Under a 21-day
              target it stays calm; cross 21 and it turns to a red flag.
            </Eg>
            <Why>
              It reads home days from the Per Diem calendar — mark them there to
              keep it honest. Set the threshold on the Settings page (default{" "}
              <span className="text-light">21 days</span>). No home marks yet?
              The card nudges you to start rather than guess.
            </Why>
          </Metric>

          <GroupHeading>The truck</GroupHeading>

          <Metric
            title="Utilization — how hard the truck runs"
            answers="The share of days the truck was under a load — pickup to delivery — since your first logged load. Idle days pull it down."
            sources={[{ label: "Garage", to: "/garage" }]}
          >
            <Formula>days under load ÷ days in window</Formula>
            <div className="mt-3">
              <UtilBar active={138} total={190} />
            </div>
            <Eg>
              Under a load 138 of 190 days →{" "}
              <span className="text-light">73%</span>. The day breakdown splits
              the rest: <span style={{ color: "#60a5fa" }}>home</span> days (you
              marked home and ran nothing) vs{" "}
              <span style={{ color: "#f87171" }}>idle</span> days (no load, not
              home) — so a low number tells you whether it was time off or
              missing freight. Unmarked days follow the per-diem default: home
              before <span className="text-light">Aug 18, 2026</span>, out
              (idle) from the flip on — one more reason marking home time
              matters. Home days still count against utilization; it's your
              truck's real opportunity cost. The window starts at your first
              logged load, so weeks before you were entering loads don't read
              as idle.
            </Eg>
            <Why>
              Across a fleet, this is the number that exposes a truck sitting
              idle while the others run.{" "}
              <span className="text-light">Benchmark:</span> best-in-class
              fleets run <span className="text-light">80–85%</span>; under{" "}
              <span className="text-light">70%</span> signals real idle time or
              weak load planning. Measuring days-under-load (not hours) keeps it
              close to the industry's revenue-hours ÷ available-hours, so the
              benchmark is a fair read. It also powers the{" "}
              <span className="text-light">Road Warrior</span> medal (70 · 80 ·
              85%).
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
            sources={[
              { label: "Garage", to: "/garage" },
              { label: "Fuel", to: "/fuel-entries" },
            ]}
          >
            <Formula>miles between full tanks ÷ gallons burned</Formula>
            <Eg>
              1,400 mi on 200 gal = <span className="text-light">7.0 mpg</span>.
              Best tank is your record; the rolling average is what the Fuel
              Miser medal climbs.
            </Eg>
          </Metric>

          <Metric
            title="Cost to run per mile — what the truck costs you"
            answers="What the rig costs per mile, all-in: fuel, maintenance, and its note. The truck page carries the truck note, the trailer page the trailer note, and the Fleet dashboard rolls both into the whole rig."
            sources={[{ label: "Garage", to: "/garage" }]}
          >
            {/* Illustrative round numbers — the app computes yours live. */}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <ChainBox top="$0.70" bottom="fuel / mi (90-day)" />
              <span className="text-muted-text">+</span>
              <ChainBox top="$0.10" bottom="maintenance / mi" />
              <span className="text-muted-text">+</span>
              <ChainBox top="$0.50" bottom="note / mi" />
              <span className="text-muted-text">=</span>
              <ChainBox top="$1.30" bottom="cost to run / mi" />
            </div>
            <Formula>
              fuel (90-day tank windows) + maintenance ÷ miles driven + note ÷
              miles per month
            </Formula>
            <Why>
              The real cost of keeping the rig rolling — the note included, so the
              number reflects what actually leaves your pocket each mile. Fuel is
              the <span className="text-light">90-day tank-window rate</span> —
              the same number the Fuel page answers with — because diesel prices
              swing too much for an all-time average to mean anything today, and
              because dollars and miles must cover the{" "}
              <span className="text-light">same stretch of road</span> (miles you
              drove before you started logging fuel don't get to water it down).
              No full-tank window in the last 90 days means fuel is unknown, so
              the whole number waits rather than showing a fuel-less total. The
              same payment also shows on the payoff tracker, but as balance paid
              down, not a per-mile cost.
            </Why>
          </Metric>

          <Metric
            title="Revenue per mile — what each mile earns"
            answers="The truck's net revenue spread over every mile it drove — its earning efficiency."
            sources={[{ label: "Garage", to: "/garage" }]}
          >
            <Formula>truck net revenue ÷ total miles driven</Formula>
            <Eg>
              $141k ÷ 55,000 mi = <span className="text-light">$2.57 / mi</span>
              . Miles/month rounds it out — how hard the truck runs.
            </Eg>
          </Metric>

          <GroupHeading>The award system</GroupHeading>

          <Section title="Four ways to win">
            <p className="text-sm text-muted-text">
              Everything you earn stacks into four tiers, smallest to grandest:
            </p>
            <ul className="text-sm text-muted-text mt-2 space-y-1.5 list-none">
              <li>
                <span className="text-light">Records</span> — your personal
                bests. They climb every time you beat your own number.
              </li>
              <li>
                <span className="text-light">Patches</span> — hard feats that{" "}
                <span className="text-light">stack a ×count</span> each time you
                re-earn them. The "impressive" ones set their bar from your own
                top-5 history — it ratchets up as you improve and never eases in
                a downturn.
              </li>
              <li>
                <span className="text-light">Medals</span> — fixed milestone
                ladders you climb I → II → III, worn on your card.
              </li>
              <li>
                <span className="text-light">Trophies</span> — once-in-a-career
                monuments in the Trophy Room.
              </li>
            </ul>
            <p className="text-sm text-muted-text mt-4 mb-1">
              The two that compute a threshold work like this:
            </p>
            <Formula>
              patch bar = your 5th-best result so far, ratcheting up (never
              down)
              <br />
              medal tier = highest fixed rung your lifetime total has passed (I
              · II · III)
            </Formula>
            <Why>
              A <span className="text-light">patch</span> bar is personal and
              adaptive: it's set from your own top-5 history for that feat, so
              it stays hard-but-fair and only ever climbs — a slow month can't
              lower it. You stack a <span className="text-light">×count</span>{" "}
              every time an event clears the bar that was in effect at that
              moment, and earns lock in for good. A{" "}
              <span className="text-light">medal</span> is the opposite — its
              rungs are <span className="text-light">fixed for everyone</span>{" "}
              (a million miles is a million miles), so it measures you against
              the whole trade, not yourself. The same two engines drive the
              truck, trailer, and dispatcher awards below.
            </Why>
          </Section>

          <Section
            title="Driver medals — climb the tiers"
            sources={[{ label: "Driver card", to: "/drivers" }]}
          >
            <div className="grid sm:grid-cols-2 gap-x-6">
              {MEDAL_GUIDE.map((m) => (
                <AwardLine
                  key={m.name}
                  icon={m.icon}
                  name={m.name}
                  sub={m.tiers}
                />
              ))}
            </div>
          </Section>

          <Section
            title="Driver patches — hard, and they stack"
            sources={[{ label: "Driver card", to: "/drivers" }]}
          >
            <p className="text-sm text-muted-text mb-3">
              Patches earned in <span style={{ color: "#60a5fa" }}>blue</span>{" "}
              are your <span className="text-light">operation-specific</span>{" "}
              feats — the oversize/flatbed set (Wide, Long, Super Load, Mountain
              Mover) tied to your Operation setting. The rest are{" "}
              <span style={{ color: "#f5b03a" }}>amber</span> universal feats
              every operation can earn. Set your operation on the{" "}
              <Link
                to="/settings"
                className="text-status-info-text hover:underline"
              >
                Settings page
              </Link>
              .
            </p>
            <div className="grid sm:grid-cols-2 gap-x-6">
              {PATCH_GUIDE.map((p) => (
                <AwardLine
                  key={p.name}
                  icon={p.icon}
                  name={p.name}
                  sub={p.how}
                />
              ))}
            </div>
          </Section>

          <Section
            title="Truck medals & patches — its own set"
            sources={[{ label: "Garage", to: "/garage" }]}
          >
            <p className="text-sm text-muted-text mb-3">
              Each asset earns its own awards, on its own stats. The truck runs
              on fuel economy and mileage.
            </p>
            <div className="grid sm:grid-cols-2 gap-x-6">
              {TRUCK_MEDAL_GUIDE.map((m) => (
                <AwardLine
                  key={m.name}
                  icon={m.icon}
                  name={m.name}
                  sub={m.tiers}
                />
              ))}
              {TRUCK_PATCH_GUIDE.map((p) => (
                <AwardLine
                  key={p.name}
                  icon={p.icon}
                  name={p.name}
                  sub={p.how}
                />
              ))}
            </div>
          </Section>

          <Section
            title="Trailer medals & patches — its own set"
            sources={[{ label: "Garage", to: "/garage" }]}
          >
            <p className="text-sm text-muted-text mb-3">
              The trailer has no engine, so it earns on the loads it carried:
              its 8% slice of net, the weight it hauled, and hub miles.
            </p>
            <div className="grid sm:grid-cols-2 gap-x-6">
              {TRAILER_MEDAL_GUIDE.map((m) => (
                <AwardLine
                  key={m.name}
                  icon={m.icon}
                  name={m.name}
                  sub={m.tiers}
                />
              ))}
              {TRAILER_PATCH_GUIDE.map((p) => (
                <AwardLine
                  key={p.name}
                  icon={p.icon}
                  name={p.name}
                  sub={p.how}
                />
              ))}
            </div>
          </Section>

          <div
            className="my-6 border-t"
            style={{ borderColor: "#22304a" }}
            aria-hidden="true"
          />
          <GroupHeading>Agents</GroupHeading>

          <Section
            title="Agent ratings"
            sources={[{ label: "Agents", to: "/agents" }]}
          >
            <p className="text-sm text-muted-text mb-4">
              You set these by hand — your call on who to work with. They show
              as a medallion on every agent, highest first.
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

          <Section
            title="Reading the roster — the Go-to score"
            sources={[{ label: "Agents", to: "/agents" }]}
          >
            <p className="text-sm text-muted-text mb-3">
              Your stars are your gut. The <span className="text-light">Go-to
              score</span> is the data's read, sitting right next to them —{" "}
              <span className="text-light">Top pick · Solid · Watch · Cold</span>{" "}
              — built from three axes:
            </p>
            <ul className="text-sm text-muted-text space-y-2 mb-3 list-disc pl-5">
              <li>
                <span className="text-light">Rate</span> — the typical $/mi they
                pay, graded <span className="text-light">within specialty type</span>{" "}
                (oversize pays more per mile, so an oversize agent is measured
                against other oversize agents — a strong standard-freight agent
                isn't buried under them).
              </li>
              <li>
                <span className="text-light">Volume</span> — loads and gross, with
                an up/down trend vs the prior 90 days.
              </li>
              <li>
                <span className="text-light">Dwell</span> — money lost to sitting.
                This counts detention you <span className="text-light">confirmed
                billable but never collected</span> — not raw wait time. Priced-in
                oversize crane time (which you never confirm billable) stays a
                candidate and <span className="text-light">never dings the agent</span>.
              </li>
            </ul>
            <p className="text-sm text-muted-text mb-3">
              The <span className="text-light">specialty label</span> is derived
              from each agent's load mix — an oversize / heavy-haul majority earns{" "}
              <span className="text-light">OVERSIZE</span>, other non-standard
              (hazmat) earns <span className="text-light">SPECIALTY</span> — so you
              can filter straight to your oversize bench. And a{" "}
              <span style={{ color: "#f5a623" }}>⚠ flag</span> marks where your
              stars and the data disagree: a low-rated agent the numbers like, or a
              high-rated one they don't.
            </p>
            <p className="text-sm text-muted-text">
              An agent stays <span className="text-light">"thin data" (unscored)</span>{" "}
              until they've run 2+ delivered loads, so one lucky run never crowns
              anyone — the same restraint the lane and rate metrics use.
            </p>
            <p className="text-sm text-muted-text mt-3">
              <span className="text-light">Concentration</span> is measured over
              your <span className="text-light">last 90 days</span>, not your
              lifetime — an agent who's gone cold isn't a dependency you still feel,
              so they drop out. Each agent's <span className="text-light">% of
              book</span> is shown in the table; the rule of thumb is no single
              agent over <span className="text-light">~30%</span> and your top 3
              under <span className="text-light">~65%</span>, so losing one wouldn't
              sink you.
            </p>
          </Section>

          <Section
            title="The quarterly leaderboard"
            sources={[{ label: "Agents", to: "/agents" }]}
          >
            <p className="text-sm text-muted-text">
              Ratings are your opinion; this is the scoreboard. Every calendar
              quarter, your agents are ranked by the revenue on the loads they
              actually delivered. Two things fall out of it — trophies, and a
              career rank — and both stick with the agent for good.
            </p>
            <Formula>
              rank = Σ GROSS revenue on delivered loads, per calendar quarter
              <br />
              board = top 5 (2+ loads) · podium = #1 &amp; #2 (3+ loads)
            </Formula>
            <Why>
              The number is <span className="text-light">gross</span> — the full
              customer rate the agent booked, not your net after the carrier's
              cut — because that's the market value they delivered (see{" "}
              <a
                href="#agents-and-lanes-are-graded-on-gross"
                className="text-status-info-text hover:underline"
              >
                graded on gross
              </a>
              ). Only <span className="text-light">delivered</span> loads count,
              and only <span className="text-light">completed</span> quarters —
              the one you're in stays live until it closes. Making the{" "}
              <span className="text-light">board</span> takes just 2 loads and a
              top-5 finish; a <span className="text-light">trophy</span> needs 3
              and a podium, so you reach the board more easily than you win the
              quarter.
            </Why>
          </Section>

          <Section
            title="Trophies"
            sources={[{ label: "Agents", to: "/agents" }]}
          >
            <p className="text-sm text-muted-text mb-4">
              Awarded each quarter to the agents who ran at least 3 loads, by
              gross delivered revenue.
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
                <p className="text-sm text-muted-text">
                  Finished #2 that quarter.
                </p>
              </div>
            </div>
          </Section>

          <Section
            title="Career rank"
            sources={[{ label: "Agents", to: "/agents" }]}
          >
            <p className="text-sm text-muted-text mb-4">
              Boards and trophies roll up into a single rank — the struck coin
              in the corner of the agent's card. It never clutters and only ever
              levels up, climbing Bronze → Silver → Gold →{" "}
              <span className="text-light">Platinum</span>, the foil-finish coin
              at the very top.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {TIERS.map(([tier, desc]) => (
                <div key={tier} className="flex items-center gap-3">
                  <Coin
                    metal={({ contender: "bronze", "all-star": "silver", champion: "gold", legend: "platinum" } as Record<string, CoinMetal>)[tier] ?? "bronze"}
                    size={44}
                  >
                    {PRESTIGE_META[tier].label.charAt(0)}
                  </Coin>
                  <div>
                    <p
                      className="font-forge font-bold text-lg"
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
              The full record — every board, gold, and silver by quarter — lives
              on each agent's own page.
            </p>
          </Section>

          <div
            className="my-6 border-t"
            style={{ borderColor: "#22304a" }}
            aria-hidden="true"
          />
          <GroupHeading>Vendors</GroupHeading>

          <Section
            title="Vendor ratings"
            sources={[{ label: "Vendors", to: "/vendors" }]}
          >
            <p className="text-sm text-muted-text mb-4">
              Vendors are the flip side of agents — the shops, escorts, permit
              services, and tire shops you <span className="text-light">pay</span>
              . You grade each one by hand, 1–5, worst to best. The grade rides
              along as a medallion everywhere. Change it and dash asks why,
              keeping a history on the vendor's page — same as agents.
            </p>
            <div className="flex flex-col gap-3">
              {(
                [
                  [5, "Your first call. Trusted with a tight window or a heavy load."],
                  [4, "Solid. No complaints — you'd use them again."],
                  [3, "Fine. Gets the job done."],
                  [2, "Last resort. Only when nobody better is free."],
                  [1, "Avoid. Burned you — steer around them."],
                ] as [number, string][]
              ).map(([r, desc]) => (
                <div key={r} className="flex items-center gap-4">
                  <div className="w-32 shrink-0">
                    <VendorPips rating={r} align="start" />
                  </div>
                  <p className="text-sm text-muted-text">{desc}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section
            title="Best per category"
            sources={[{ label: "Vendors", to: "/vendors" }]}
          >
            <p className="text-sm text-muted-text">
              Every vendor sits in one category — Shop, Escort / Pilot Car,
              Permits, and so on. Within each, dash ranks them by the grade you
              gave and stamps GO-TO on the top one, right in the category's
              header. That stamp is the quick answer to “who's my best escort?”
              — no digging. The other end shows too: anyone rated 2 or lower
              wears STEER CLEAR, and an unrated vendor rides as UNPROVEN ghost
              pips until the first job earns a grade.
            </p>
            <Formula>
              go-to = highest-rated vendor in the category (ties broken by
              name)
            </Formula>
            <Why>
              It's ranked on <span className="text-light">your</span> grades,
              nothing automatic — an honest “best of what I've got,” even when a
              category is thin.
            </Why>
          </Section>

          <Section
            title="Shop spend"
            sources={[
              { label: "Vendors", to: "/vendors" },
              { label: "Maintenance", to: "/maintenance" },
            ]}
          >
            <p className="text-sm text-muted-text">
              For <span className="text-light">shops</span>, dash pulls what
              you've already spent with them straight from your maintenance log —
              the total and how many services — and shows it on the list and
              their page.
            </p>
            <Why>
              It's matched by <span className="text-light">name</span>: a shop's
              spend links when the vendor name on a maintenance service matches
              the vendor's name here. Escorts, permits, and the rest just carry
              the rating for now — the spend score grows from the shops, where
              the data already lives.
            </Why>
          </Section>

          <div
            className="my-6 border-t"
            style={{ borderColor: "#22304a" }}
            aria-hidden="true"
          />
          <GroupHeading>Team &amp; roles</GroupHeading>

          <Section title="Adding a dispatcher">
            <p className="text-sm text-muted-text">
              As the owner (an <span className="text-light">admin</span>), you
              can add a <span className="text-light">dispatcher</span> to your
              account from{" "}
              <Link
                to="/settings"
                className="text-status-info-text hover:underline"
              >
                Settings → Team
              </Link>
              . They sign in with their own email and password, but everything
              they see is your account's data — same loads, agents, and trucks.
              It's one shared operation, with a login of their own.
            </p>
          </Section>

          <Section
            title="The Plan — Account Status"
            sources={[{ label: "Account Status", to: "/status" }]}
          >
            <p className="text-sm text-muted-text">
              Your yearly cash plan, tracked one Friday at a time. The ritual is
              snapshot-<span className="text-light">first</span>: after the
              settlement and payroll land, punch in the raw balances (Ops,
              Vault, Maintenance, Tax, Trailer fund) — then the page hands you
              the orders: sweep everything over the Ops float line to the
              Vault, and send anything above the protected cushion to the
              current waterfall stage. Next Friday's snapshot confirms the
              moves landed.
            </p>
            <Formula>
              sweep = max(0, ops − float line) · overflow = max(0, vault −
              highest completed vault threshold)
            </Formula>
            <Why>
              The waterfall is a ladder of stages — vault thresholds that
              ratchet the protected cushion upward, debts that die from the
              overflow (bound live to your obligations), and overflow funds
              like the trade-up war chest, measured as vault money above the
              protected cushion. (The snapshot's trailer figure is the trailer
              HOLDING account — note and guarantor out, zeroes monthly — it
              rides the Reserves card, not the waterfall.)
              The stages <span className="text-light">are</span> the plan:
              edit them, reorder them, or write next year's plan fresh — the
              old year keeps its history. Marge reads the same tables
              (plans, stages, snapshots, obligations) for the Friday report.
            </Why>
          </Section>

          <Section title="What a dispatcher sees">
            <p className="text-sm text-muted-text">
              A dispatcher's menu is trimmed to the day-to-day: the Dispatch
              board, Score a Load, Loads, Trips, Lanes, Agents, Facilities, the
              fleet (Trucks, Trailers, Drivers), Maintenance, Compliance, and
              this Guide. The money pages — Expenses, Per&nbsp;Diem, Recap,
              Fuel, Garage, Trophy Room, and Settings — stay owner-only, so the
              P&amp;L is yours alone.
            </p>
          </Section>

          <Section title="The Dispatch board">
            <p className="text-sm text-muted-text">
              A dispatcher's dashboard leads with the operational picture
              instead of the money: how many loads are{" "}
              <span className="text-light">booked</span> and{" "}
              <span className="text-light">in transit</span>, loads delivered
              this month, <span className="text-light">detention owed</span>,
              and <span className="text-light">deadhead</span> this month
              against a rolling 90-day average. Detention is shown in{" "}
              <span className="text-light">hours</span>, not dollars — the rate
              per hour isn't settled until it lands on your statement, so the
              board tracks the wait you're owed and lets you mark it paid once
              collected. Your rank rides the top bar — it climbs on lifetime
              loads booked, and the next tier is always shown. The booking
              floor and week pace share the same meter as the owner's board:
              the target sits at about three-quarters of the track with
              overdrive room past it for the weeks you beat it. Below the
              pace plate and the heat streak sit two
              searchable, paginated tables —{" "}
              <span className="text-light">Loads</span> (with the load on the
              road pulled out on top, and filters for booked / in&#8209;transit
              / delivered / detention) and{" "}
              <span className="text-light">Agents</span> — then the
              Top&nbsp;Agents leaderboard. Net revenue, RPM, and profit never
              appear.
            </p>
          </Section>

          <Section title="Agents &amp; lanes are graded on gross">
            <p className="text-sm text-muted-text">
              Everywhere an <span className="text-light">agent</span> or a{" "}
              <span className="text-light">lane</span> is ranked — the
              Top&nbsp;Agents leaderboard on either dashboard, the Agents table
              — the number is <span className="text-light">gross</span> revenue
              (the full customer rate), not net. An agent who books a strong
              load did their job; they shouldn't be marked down because a
              deadhead leg or a cost of yours thinned the net. Net is your
              operational result and lives on the owner side; gross is what the
              agent and the lane actually delivered.
            </p>
          </Section>

          <Section title="The Dispatcher Card">
            <p className="text-sm text-muted-text">
              Every dispatcher has their own card — an avatar, a{" "}
              <span className="text-light">career rank</span> that climbs on
              lifetime loads booked (Rookie Dispatcher → Load Wrangler → Freight
              Closer → Rate Hawk → Dispatch Legend), a season grade, and five
              booking stats: <span className="text-light">loads booked</span>,{" "}
              <span className="text-light">gross booked</span>, the{" "}
              <span className="text-light">average booked rate</span> against
              your break-even floor,{" "}
              <span className="text-light">detention collected</span>, and{" "}
              <span className="text-light">on-time %</span>. It sits at the top
              of the dispatch board and opens to a full page with the rank
              ladder.
            </p>
            <p className="text-sm text-muted-text mt-3">
              The card counts only the loads a person actually booked. Every
              load records a <span className="text-light">"Booked by"</span> —
              it defaults to whoever enters it, so a dispatcher's own loads
              credit to them automatically. As the owner you'll see a Booked-by
              picker on the load form to hand credit to a dispatcher for a load
              you entered, and you can open any teammate's card from{" "}
              <Link
                to="/settings"
                className="text-status-info-text hover:underline"
              >
                Settings → Team
              </Link>
              . Everything on the card is gross, never net.
            </p>
          </Section>

          <Section
            title="Dispatcher achievements — patches &amp; medals"
            sources={[{ label: "Dispatch board", to: "/dashboard" }]}
          >
            <p className="text-sm text-muted-text">
              Her page carries two kinds of earned awards, and they pop the same
              way the driver's do. <span className="text-light">Patches</span>{" "}
              are the everyday grind — Deal Closer, Big Month, Rate Hawk,
              Clockwork (on-time), Quick Turn, Oversize Ace, Lean Machine,
              Bounty Hunter, Right Hand, Iron Booker, and Backhaul&nbsp;Boss
              (loads booked out of the market where the last one delivered) —
              each climbs a ×count and celebrates at milestones as she books.{" "}
              <span className="text-light">Medals</span> are the rare, hard
              feats you can't just grind out — Steal (a load the scorer rates a
              steal), Double-Up (2× break-even), Superload, Whale (a huge single
              load), Perfect Week, Grand&nbsp;Slam (a steal that's on-time with
              under 10% deadhead), and Big Week. All of it is scored off her own
              bookings, on gross.
            </p>
            <Formula>
              patches use the same adaptive bar · medals are the rare fixed
              feats
              <br />
              every stat is scored on her bookings only (booked_by = her), on
              gross
            </Formula>
            <Why>
              Same two engines as the driver's awards, pointed at booking
              instead of driving: a patch bar ratchets up off her own top-5
              history, and a medal fires on a one-off hard feat. The deadhead a
              Lean Machine or Grand Slam reads is the load's{" "}
              <span className="text-light">actual odometer deadhead</span> once
              it has run — the planning field is never counted (see{" "}
              <a
                href="#deadhead"
                className="text-status-info-text hover:underline"
              >
                Deadhead
              </a>
              ).
            </Why>
          </Section>

          <Section
            title="Dispatcher season &amp; trophies"
            sources={[{ label: "Dispatch board", to: "/dashboard" }]}
          >
            <p className="text-sm text-muted-text">
              Her page also carries a{" "}
              <span className="text-light">season card</span> — a month, quarter,
              or year recap of the loads she booked (gross, on her bookings
              only): loads, gross, average rate against target, on-time, and her
              best load. Three <span className="text-light">period trophies</span>{" "}
              sit under it, each tracked against a personal bar:
            </p>
            <div className="flex flex-col gap-1.5 mt-3">
              <p className="text-sm text-muted-text">
                <span className="text-light">Booking Champion</span> — a
                big-volume period (8 loads a month, 24 a quarter, 90 a year).
              </p>
              <p className="text-sm text-muted-text">
                <span className="text-light">Rate Champion</span> — the period
                averaged at or above your target rate.
              </p>
              <p className="text-sm text-muted-text">
                <span className="text-light">Perfect Period</span> — every load
                in the period at or above target. The hard one.
              </p>
            </div>
            <Why>
              A locked trophy shows what's still missing ("3 loads under
              target"), so it reads as a goal, not a scold. They're personal on
              purpose: with one person booking most of the freight, a
              head-to-head "champion" would just be the same name every period —
              these reward your own best month instead. Earn one and it pops like
              a patch does.
            </Why>
          </Section>

          <Section
            title="The Dispatch Forge"
            sources={[{ label: "The Forge", to: "/forge" }]}
          >
            <p className="text-sm text-muted-text">
              Everything a dispatcher earns lives in one place —{" "}
              <span className="text-light">The Dispatch Forge</span>, her own room
              reached from the <span className="text-light">Forge</span> entry in
              the menu. It gathers her rank and progress to the next tier, her{" "}
              <span className="text-light">coins</span> (medals) and{" "}
              <span className="text-light">tags</span> (patches), and this
              quarter's <span className="text-light">season crowns</span> — all
              scored on the loads she booked.
            </p>
            <p className="text-sm text-muted-text mt-3">
              It leads with{" "}
              <span className="text-light">Next up — within reach</span>: the
              handful of achievements she's closest to, most-progressed first, so
              there's always a concrete next thing to chase. Every award — earned
              or locked — carries a short line on exactly{" "}
              <span className="text-light">how to earn it</span>, and booking a
              steal, running a clean week, or extending her streak fires the same
              celebration the owner gets.
            </p>
            <Why>
              Her <span className="text-light">HEAT</span> streak is graded
              against her own typical week — the median of her recent weekly
              booked gross over the trailing quarter — not the shop's cost
              target. A week at three-quarters of her usual keeps it hot. That
              keeps the streak winnable and seasonal: the bar tracks the market
              she's actually booking in, and it's hers, not the whole
              operation's.
            </Why>
          </Section>
        </main>
      </div>
    </div>
  );
};

export default GuidePage;
