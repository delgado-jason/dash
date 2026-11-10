import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useLoads } from "@/hooks/useLoads";
import { useRateTargets } from "@/hooks/useRateTargets";
import type { RateLadder } from "@/lib/metrics/rateTargets";
import { money, rpm } from "@/lib/format";
import { ArrowRight } from "lucide-react";
import { RatingLabel } from "@/components/agents/RatingLabel";
import { VendorPips } from "@/components/vendors/VendorPips";

const AMBER = "var(--color-amber)";
const AMBER_HI = "var(--color-amber-hi)";
const GREEN = "var(--color-cat2)";
const TRACK = "var(--color-plate)";

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
        style={{ borderColor: "var(--color-hairline)", color: AMBER_HI }}
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
  <div className="rounded-md p-3" style={{ background: "var(--color-canvas)", border: "1px solid var(--color-hairline)" }}>
    <p className="text-sm">
      <span className="font-condensed font-bold" style={{ color: AMBER_HI }}>{name}</span>
      <span className="text-muted-text"> — {q}</span>
    </p>
    <p className="text-xs text-muted-text mt-1">{children}</p>
  </div>
);

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
      background: "var(--color-canvas)",
      border: "1px solid var(--color-hairline)",
      color: "var(--color-ink)",
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
    style={{ background: "var(--color-status-aware-bg)", borderLeft: `2px solid ${AMBER}` }}
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
    style={{ background: "var(--color-canvas)", border: "1px solid var(--color-hairline)" }}
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

// The rate ladder, drawn with the LIVE rungs (the bar's proportions are
// illustrative; the dollars are today's — a worked number in a guide goes stale).
const MiniLadder = ({ ladder, spec }: { ladder?: RateLadder | null; spec?: RateLadder | null }) => (
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
        <span className="text-light">{rpm(ladder?.walkAway)}</span>
      </span>
      <span className="absolute left-[67%] -translate-x-1/2 text-center">
        target
        <br />
        <span className="text-light">{rpm(ladder?.target)}</span>
      </span>
      <span className="absolute right-0 text-right">
        strong
        <br />
        <span className="text-light">{rpm(ladder?.strong)}</span>
      </span>
    </div>
    <div
      className="flex items-center gap-2 flex-wrap mt-2 pt-2 text-xs"
      style={{ borderTop: "0.5px solid color-mix(in srgb, var(--color-ink) 7%, transparent)" }}
    >
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-block rounded-full shrink-0"
          style={{ width: 8, height: 8, background: "var(--color-status-negative-text)" }}
        />
        <span className="text-light">Specialized</span>
      </span>
      <span className="text-[11px] text-muted-text">oversize · hazmat · heavy</span>
      <span className="ml-auto text-muted-text">
        target <span style={{ color: AMBER }}>{rpm(spec?.target)}</span> · strong{" "}
        <span style={{ color: "var(--color-status-positive-text)" }}>{rpm(spec?.strong)}</span>
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
    items: [
      "dash on your phone","The tabbed dashboard — five views of your operation","The Pulse tab — four bands"],
  },
  {
    group: "The Foreman",
    items: ["The Foreman — who to call from where you'll be empty next"],
  },
  {
    group: "The money",
    items: [
      "Net and gross — two revenues, each named",
      "True cost per mile",
      "Break-even — the rate to book",
      "The rate ladder",
      "Load Scorer — Take It or Leave It",
      "Weekly & daily targets",
      "Market & Rates — reading the cycle",
      "Rate per mile (RPM)",
      "Lane rate — typical vs blended",
      "The market ledger — out and in",
      "The reload cost — what a stop leaves you",
      "Outstanding loads — how long money sits",
      "The cash board — this period and the next",
      "OPS NOW — the number you type",
      "ASSUMPTIONS — the planning inputs behind the board",
      "What dash refuses — a blank is never zero",
      "The Integrity page — what dash is working around",
      "The settlements — Landstar's actuals",
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
      "The line above the table",
      "The odometer carries itself",
      "The loads table, by color",
      "Paperwork on a load",
      "Facility & agent scorecards",
    ],
  },
  {
    group: "The driver page",
    items: [
      "Bottleneck — your three profit levers",
      "Hometime — days since you were home",
    ],
  },
  {
    group: "The truck",
    items: [
      "Utilization — how hard the truck runs",
      "Fuel economy — miles per gallon",
      "Fuel + shop + note per mile — what the truck itself costs you",
      "Revenue per mile — what each mile earns",
    ],
  },
  {
    group: "Compliance",
    items: ["Compliance — Mark renewed, and the cycle it keeps"],
  },
  {
    group: "The shop",
    items: [
      "Maintenance — four units, four meters",
      "APU hours — the projection",
      "Due next and the unit boards",
      "Logging a service",
    ],
  },
  {
    group: "The website",
    items: ["The website — who's looking"],
  },
  {
    group: "Agents",
    items: [
      "Relationships — the book of agents",
      "Agencies and posting codes",
      "Agencies — the book by agency",
      "Editing an agent",
      "Inbound share — is the system working?",
      "Prospects — from stranger to agent",
      "The call list — reactivation, prospects, the one question",
      "Agent ratings",
      "Reading the roster — the Go-to score",
    ],
  },
  {
    group: "Vendors",
    items: [
      "Vendor ratings",
      "Best per category",
      "Shop spend",
      "One-offs and merged spellings",
    ],
  },
  {
    group: "Team &amp; roles",
    items: [
      "Adding a dispatcher",
      "What a dispatcher sees",
      "The Dispatch board",
      "Agents and lanes are graded on gross",
      "The dispatcher page",
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
  // The live basis — the Guide quotes TODAY's figures where it used to carry
  // worked numbers that went stale within a quarter (Nod Sheet §7, 2026-11-04).
  const { loads } = useLoads(0);
  const targets = useRateTargets(loads);
  const basis = targets.basis;
  const live = {
    cpm: rpm(basis.costPerTotalMile),
    keep: targets.keep > 0 ? `÷ ${Math.round(targets.keep * 100)}%` : "÷ —",
    keepPct: targets.keep > 0 ? `${Math.round(targets.keep * 100)}%` : "—",
    book: rpm(targets.bookingLadder.walkAway),
    window: basis.windowLabel ?? "no P&L filed",
    eg:
      basis.trueMonthlyCost != null && basis.months > 0 && basis.costPerTotalMile != null
        ? `${money(basis.trueMonthlyCost)}/mo ÷ ~${Math.round(basis.totalMiles / basis.months).toLocaleString("en-US")} miles ≈ ${rpm(basis.costPerTotalMile)} per mile · ${basis.windowLabel ?? ""}`
        : "Upload a P&L on Expenses and this line shows your own figure.",
  };
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

          <Section title="dash on your phone">
            <p className="text-sm text-muted-text">
              dash installs like an app: open it in your phone's browser and
              use <span className="text-light">Add to Home Screen</span>. It
              gets its own icon, launches full-screen without browser chrome,
              and lands on the dashboard. Same app, same login — just one tap
              from the home screen.
            </p>
          </Section>

          <Section title="The tabbed dashboard — five views of your operation">
            <p className="text-sm text-muted-text mb-3">
              The dashboard is split into tabs, each answering one question at a
              glance. Pick a tab and it stays put — dash remembers where you left
              off next time you open it. Every day boundary here and on the
              driver page is <span className="text-light">your local day</span>,
              and it rolls at midnight — a tab left open overnight shows the new
              day without a reload (it used to flip to tomorrow at 6 pm
              Central).
            </p>
            <div className="flex flex-col gap-2.5">
              <TabLine name="Pulse" q="Is the business OK, and what's next?">
                Four bands, top to bottom: the bottom line (cash on hand, the
                next deposit, this pay week, profit to date), whether you're
                priced and running right (the rate ladder, deadhead, net $ per
                loaded mile, on-time), what's on the clock (the Next rail and
                detention owed), and the long game (the Plan's floors and the
                stage you're on). Each figure comes from the same function as
                the page it summarises; the card-by-card account is just below.
              </TabLine>
              <TabLine name="Money" q="Am I profitable?">
                The months of the year in one table — income net of the carrier
                cut, operating profit, the after-notes figure (operating minus
                the truck, trailer and loan notes) and the after-notes margin
                graded against your goal on every row — with a subtotal row for
                each closed quarter and the year's total, which also counts the
                months at or above the goal (a count, not a streak). Above it,
                the month in progress: income so far from delivered loads at net
                against the month's cost threshold (the mean of the same six
                P&amp;L months the Market and Expenses price on), the shortfall or
                the margin over, the days left and the day you are on pace to
                cover it, with the caveat that the real P&amp;L takes over when the
                month posts; beside it the latest filed month, the day it was
                filed, and a reminder that the current month posts when you file
                it. Under the table, your realized per-mile line — the net
                P&amp;L over the odometer miles you drove: income, all-in and kept
                per mile — which is not the gross rate to book on Expenses and
                Market. Then the month-by-month P&amp;L bars and the margin trend
                against the goal, the weekly earnings chart (the last eight pay
                weeks in gross, the target and floor dashed, your best completed
                pay week as a plain line, and how many of this quarter's
                completed weeks earned at or above break-even), and where the
                money goes by category as a share of income.
                (Delivered-but-unsettled money shows on Pulse as your next
                deposit — it clears every week.)
              </TabLine>
              <TabLine name="Lanes" q="Where does my freight run?">
                The glance before the board, on the board's own window — the
                trailing twelve months, this year or all time. Your freight
                repeats by MARKET rather than by lane (seventy-five loads over
                sixty-nine distinct lanes, four of them run twice, but Charlotte
                loaded seven times), so every row here is a market. Where you
                load lists the markets you have loaded in three or more times,
                each with its typical dollars a loaded mile, its gross and the
                ledger's OUT grade; where you deliver lists the markets you have
                delivered into three or more times, each with the median empty
                miles to your next pickup, how many of those reloads were within
                eighty-five miles, and the ledger's IN grade — the reload read as
                a share of the load it led to. The "within" count is always out
                of the reloads that were logged, never out of the deliveries,
                because a delivery nobody logged a reload for is not a free
                reload. Then one line on getting empty: how many reloads, the
                median empty miles, how many fell within eighty-five and within
                a hundred and twenty-five, how many ran beyond, the empty share
                of the miles you drove, and the gaps of a week or more that were
                home time — named, then kept out of every average, because a
                truck parked on purpose is not a market's fault. Underneath, the
                map thumbnail as the one door to the situation board, your repeat
                lanes with the count of lanes that ran only once, and the
                load-type mix now carrying each type's typical rate, not just its
                share. Every figure is the Lanes page's own engine read at market
                grain, so the board one click away always agrees with it.
              </TabLine>
              <TabLine name="Agents" q="Who should I call?">
                The leaderboard is the spine — your desks ranked by what their
                freight pays per mile driven, graded on your own rate ladder —
                and the whole tab now reads the board's own window, so every
                figure beside it describes the same loads the board ranked
                (twelve months, ninety days or all time; a load counts from the
                day the desk gave it to you, its pickup). Beneath it, two
                questions a spot book actually has to answer. Where the book
                comes from splits your money by how often a desk came back: the
                ones you used once, twice, and three or more times. On this book
                most of the money comes from desks that never came back, which
                is why the old concentration card — asking whether one agent
                owned too much of you — was watching the wrong door. And Gone
                quiet lists only the desks that DID come back and have since
                gone silent for sixty days, richest first, because a desk you
                used once is a stranger rather than a lapsed relationship. Then
                who you have been running with lately, most recent first. The
                rate × volume scatter and the gut-vs-data flag came off: the
                first drew lifetime figures under a windowed tab, and the second
                compares your star rating against the numbers, which only says
                anything once you have actually rated your desks on the Agents
                page. Dollars here are gross — agents are a market-value lens,
                what the freight is worth before your settlement cut.
              </TabLine>
              <TabLine name="Fleet" q="Is the truck ready to roll?">
                The chart leads: the miles you drove each month for a year,
                split into loaded and empty, with the rate that month's miles
                forced written above each bar and the miles themselves written
                below. This is the one on the tab worth reading first, because
                your floor is <b>(what the month cost) ÷ (the miles you drove) ÷
                your keep</b> — the miles are the denominator. A thin month does
                not cost less: the notes, the insurance and the permits do not
                care how far you went, so the same dollars land on fewer miles
                and every one has to carry more. In 2026 that moved the floor
                from $2.68 a mile in a six-thousand-mile month to $8.21 in a
                two-thousand-mile one. The empty miles are stacked in because
                the floor is per mile <i>driven</i> — an empty mile costs you
                and pays nothing, so it raises the bar on the loaded ones. The
                bars come off the odometer and are there every month; the rate
                above them needs a filed P&amp;L, so a month you have not filed
                shows bars and no figure, which is the nudge to file it. Below
                the chart the truck's own business: her cost to run per mile
                (fuel + shop + note, fuel on the last 30 days — the P&amp;L's
                all-in cost per mile stays on Expenses, and the rate to book
                stands on that one), the odometer, the next service with its
                meter, service and compliance, fuel economy, home time (days
                out), how hard she runs — under load against home and idle,
                with the day counts — the shop log across the year, the payoff
                trackers, and a day-by-day heatmap of earning vs. home vs. idle.
                Every panel says the window it is reading.
              </TabLine>
            </div>
          </Section>

          <Metric
            title="The Pulse tab — four bands"
            answers="The owner's landing page: what you have, what's coming, whether you're priced right, and where the plan stands."
            sources={[
              { label: "Dashboard", to: "/dashboard" },
              { label: "Cash Flow", to: "/cashflow" },
              { label: "Plan", to: "/status" },
            ]}
          >
            <Formula>
              THE BOTTOM LINE · cash on hand = the cash board's current-period
              ending, against the plan's Ops float line · next deposit = the
              board's next landing · this pay week = gross booked against the
              weekly target · profit = the P&amp;L year to date, true net =
              operating profit − the monthly note × filed months
              <br />
              PRICED AND RUNNING RIGHT · the rate ladder with where you're
              booking · deadhead · net $ per loaded mile · on-time
              <br />
              ON THE CLOCK · the Next rail · detention owed
              <br />
              THE LONG GAME · the three floors · the stage · the leave reserve
            </Formula>
            <Why>
              <span className="text-light">Cash on hand</span> is the Cash Flow
              page's own number — the Ops balance you typed (OPS NOW or the
              Friday snapshot) plus every line dated after it, through this
              period's deposit — not a second calculation. The line under it
              names the number it opened on, its day, and how many counted
              lines the board has walked since. Under the float it reads
              "under the float by $X" in red, over it "over the float by $X" in
              green. When a planning input is blank (payroll, the fuel
              advance…) the plate says what the board waits for instead of a
              number, and with no Ops number typed it asks for one. The{" "}
              <span className="text-light">next deposit</span> beside it is last
              period's deposit if it still lands today or later, else this
              period's, by the deposit rule on the cash board above.
            </Why>
            <Why>
              <span className="text-light">This pay week</span> is gross booked
              in the Wednesday–Tuesday week against the weekly target — the
              line the pace bar draws, with the delivered and booked counts and
              the days left. The projection counts each load once, by its
              delivery day inside the week. It's a plain number: there is no
              record tag or best-week banner here. <span className="text-light">
              Profit</span> reads the filed P&amp;L months of the year — the
              same arithmetic the Money tab uses — as the after-notes true net,
              the after-notes margin graded against your margin goal, and the
              last filed month's operating profit by name; the current month
              says it posts when you file it.
            </Why>
            <Why>
              The four instruments in the second band are the ones the rest of
              the guide defines — the ladder is "The rate ladder", deadhead
              and net $ per loaded mile come off the odometer-true basis. The{" "}
              <span className="text-light">detention owed</span> card is the
              dispatch board's figure: loads confirmed billable and not yet
              collected, and the minutes each ran past the free hours set in
              Settings; tap it to see the loads.
            </Why>
            <Why>
              <span className="text-light">The floors</span> are the Plan page's
              three floors in fill order — Ops, Maintenance, Vault — each as its
              balance of its floor and the percent, with the tax set aside and
              the date of the snapshot they read. On Plan itself that block is
              the <span className="text-light">only</span> place those balances
              are drawn: an Ops card and a Vault card used to repeat floors 1
              and 3 in a bigger font, and a Reserves block repeated floor 2.
              <span className="text-light"> The ladder</span> below it draws{" "}
              <span className="text-light">compact</span> while any floor is
              short — every rung still named and targeted, the one the next
              dollar reaches still open — and every rung opens on its own the
              week Ops holds its float. Nothing can move until then, and four
              empty meters is the number 0% drawn four times. <span className="text-light">
              The stage</span> is the active rung of the plan's waterfall; for a
              loan it shows the balance left, the monthly draft and the payoff
              month — and when the balance has no as-of date it says the payoff
              date is unknown rather than guessing. One line under it dates when
              the truck is free and clear from the truck's own loan, or says why
              it can't.
            </Why>
          <Why>
                <span className="text-light">Leave reserve</span> is the Vault in
                weeks of a parked truck. A parked week costs your weekly payroll
                plus the sit cost — fixed costs and the notes, the same figure the
                Expenses page prints — and the card divides the Vault by it:
                "0.0 wk of 4 · Vault $0 · a parked week ≈ $3,000 · 4 weeks ≈
                $13,100". The horizon in weeks is yours, set on the Plan page
                (EDIT PLAN); settlements still to land are not counted toward it,
                because a reserve you can spend only if a check arrives is not a
                reserve. A missing payroll, basis, balance or horizon is named
                with where to set it, never read as zero.
              </Why>
            </Metric>

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
              here. Every name on the board carries the 3-letter code{" "}
              <span className="text-light">that agent wears</span> as a small plate
              chip — their own posting code, drawn{" "}
              <span className="text-light">dashed</span>, or their agency's shared
              desk, drawn <span className="text-light">lit</span> — the code you'd
              key into the load board or say on the phone, so "Linda Janzen · EWT"
              reads at a glance. No chip shows when neither is on file.
            </p>

            <p className="text-sm font-condensed mb-1" style={{ color: AMBER_HI }}>
              One list — Direct or Spot is a chip, not a rank
            </p>
            <p className="text-sm text-muted-text mb-3">
              Agents split into two buckets:{" "}
              <span className="text-light">Direct</span> customers — an agent you've
              hit the same shipper or receiver 2+ times through (their own account,
              worth a relationship) — and <span className="text-light">Spot</span>{" "}
              market agents (load-board one-offs). The bucket does{" "}
              <span className="text-light">not</span> order the board. The Top Call
              plate goes to the highest measured score, direct or spot, and every
              agent below it sits in{" "}
              <span className="text-light">one list, in score order</span>, wearing a
              DIRECT or SPOT chip. Direct-over-spot only breaks a tie between two
              equal scores — so a six-load spot agent loading out of the town you'll
              be empty in outranks a one-trip direct customer three states away, and
              the screen says so. (It didn't always: the rows used to be split into a
              Direct group above a Spot group, which put a 0.54 direct customer over a
              0.81 spot agent — the label overruling the evidence.) The bucket
              auto-updates as loads come in; you can pin an agent either way on the
              Agents page.
            </p>

            <p className="text-sm font-condensed mb-1" style={{ color: AMBER_HI }}>
              Proved or claimed — where an agent's freight sits
            </p>
            <p className="text-sm text-muted-text mb-3">
              An agent's footprint is made of two kinds of point, and the proximity
              cell captions which one it measured.{" "}
              <span className="text-light">Proved</span> is a market one of their
              loads put on the map. <span className="text-light">Claimed</span> —
              drawn with a dashed underline — is a market they{" "}
              <span className="text-light">named on a call</span>, captured on the
              footprint six on the call screen. A claim counts as a real point with
              the same distance math: a market Brandie wrote down is either a market
              or it isn't, and discounting it would be a knob nobody asked for. So an
              agent who has hauled you one load out of nowhere useful can still be 95
              miles away because they told you where their freight is. The caption
              flips to proved on its own the first time a load lands from that city. An
              agent with no load yet but a claimed market is on the list too, wearing
              New · building — that is how an agent from Brandie's qualification
              sweep reaches the board before the first load.
            </p>

            <p className="text-sm font-condensed mb-1" style={{ color: AMBER_HI }}>
              Where you'll be empty next
            </p>
            <p className="text-sm text-muted-text mb-3">
              The anchor is the destination of the furthest-out load you're already
              committed to (booked or in-transit) — you're covered until it drops.
              With nothing committed, you're already empty wherever the truck last
              stopped: your last delivery, or the end of a trip that rolled after
              it — home, the shop, a repositioning run. The Scorer's truck
              location and the Lanes map's pin read the same anchor.
            </p>

            <p className="text-sm font-condensed mb-1" style={{ color: AMBER_HI }}>
              The three axes
            </p>
            <ul className="text-sm text-muted-text mb-3 space-y-1.5 list-disc pl-5">
              <li>
                <span className="text-light">Proximity</span> — straight-line miles
                from your empty-next point to the{" "}
                <span className="text-light">nearest</span> point on that agent's
                footprint, proved or claimed (their closest one, not their average —
                the question is "can they load me near here"). Which end of a load
                lands on the footprint follows{" "}
                <span className="text-light">the customer mark</span> on that load,
                below.
              </li>
              <li>
                <span className="text-light">Rate</span> — the agent's gross dollars
                per <span className="text-light">loaded</span> mile for a load type,
                measured against your own <span className="text-light">realized median
                rate for that type</span> (your flatbed rate runs far under your
                oversize rate, so the yardstick has to be per-type). Loaded-mile, the
                same basis as the Agents page, so an agent is never dinged for a
                deadhead they didn't cause. The rate cell also carries that
                agent's <span className="text-light">$/day</span> — what their
                freight pays per day of the truck, weighted over the same
                delivered loads of that type, miles or no miles, and coloured
                against your own daily target from the rate ladder, per
                calendar day (see{" "}
                <span className="text-light">Lane rate — typical vs blended</span>
                ) — though the score itself still runs on the $/mi.
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
              <span style={{ color: "var(--color-cat2)" }}>New · building</span> — not a
              low-confidence reject, but a relationship worth deepening. Distances are
              straight-line estimates (shown with a ~) and sharpen to real miles as the
              app geocodes each city quietly in the background; a city it can't place
              yet falls back to region-level rather than a fake number.
            </p>

            <p className="text-sm font-condensed mb-1 mt-4" style={{ color: AMBER_HI }}>
              Parked agents within 75 miles
            </p>
            <p className="text-sm text-muted-text mb-3">
              Parked agents — one you parked with a written reason, or one gone{" "}
              <span className="text-light">dormant</span> (no load, no two-way
              contact, nothing at all for 180 days) — never sit in the ranked rows
              above and are never owed a message. They surface here only when the
              truck is close: a dimmed group,{" "}
              <span className="text-light">PARKED · WITHIN 75 MI OF {"{"}your
              empty-next city{"}"}</span>, lists every parked agent whose footprint —
              a city they've loaded you from, or a market they named on a call —
              sits within 75 straight-line miles of where you'll be empty. Each row
              carries the PARKED chip and why they're parked ("dormant since Mar
              27" or your own reason), then the miles, their loads and gross, and
              how many days they've been quiet. If the contact log didn't load,
              the group lists only the agents you parked yourself and says so —
              dash never calls an agent dormant on half the evidence. The point
              is their <span className="text-light">freight</span>: grab a board
              load out of their town while you're there — no outreach owed, no
              touch to log. Tap a row for the agent sheet: Unpark puts them back
              in the book as a Prospect (or their tier); a dormant agent comes back
              on its own the day a load or a reached call happens. An agent with
              no footprint the app can place is left out rather than guessed.
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
            title="Net and gross — two revenues, each named"
            answers="Net — what you keep after the carrier's cut — on the Dashboard's income, the Loads totals and the driver page. Gross — the full customer rate — wherever a rate per mile is graded: the ladder, Score a Load, the Market page, the driver page's Rate lever. Every figure says which it is."
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
              cost per mile = true cost ÷ every mile the truck drove — the loads'
              odometer windows and the home and shop trips you logged, as one union
            </Formula>
            <Eg>{live.eg}</Eg>
            <Why>
              Blended over your last{" "}
              <span className="text-light">six complete months</span> with a
              P&L filed. With one truck, a month’s cost per mile mostly measures
              how many miles the month had — August ’26 ran $4.52 a mile on a
              home-and-shop month, September $2.54 — so three months swung the
              rate to book by a dollar a mile. Six smooths that and still turns
              within two quarters when a real cost changes. The Market page
              names the months, the ones still unfiled, and the spread between
              them; the Expenses page runs its per-mile tiles, its burn and its
              rate to book on the same window. It's over{" "}
              <span className="text-light">total</span> load miles —
              loaded, and the empty miles between loads — because every mile
              costs you. Home and shop trips count too (your call, Nov 5, 2026):
              the dollars spread over every mile the truck drove, the way the
              Deadhead KPI already counts them.
            </Why>
          </Metric>

          <Metric
            title="Break-even — the rate to book"
            answers="The gross rate per mile you have to book to cover your cost."
            sources={[
              { label: "Dashboard", to: "/dashboard" },
              { label: "Score a Load", to: "/score" },
              { label: "Expenses", to: "/expenses" },
            ]}
          >
            <Formula>
              break-even $/mi = cost per driven mile ÷ your keep %
            </Formula>
            <div className="flex items-center gap-2 flex-wrap my-3">
              <ChainBox top={live.cpm} bottom="cost / mile" />
              <ArrowRight size={16} className="text-muted-text" />
              <ChainBox top={live.keep} bottom="your blended keep" />
              <ArrowRight size={16} className="text-muted-text" />
              <ChainBox top={live.book} bottom="gross to book" />
            </div>
            <Why>
              Two haircuts, and they're different: you fold your{" "}
              <span className="text-light">deadhead</span> into the miles
              yourself (cost is spread over every mile you drive), and you keep
              only part of what you book — the schedule's share of the linehaul, but{" "}
              <span className="text-light">100% of the fuel surcharge</span> and
              of tarp, detention and loading pay. A toll is different: Landstar
              hands it back as a{" "}
              <span className="text-light">reimbursement</span>, not revenue, so
              it sits below a load's total and leaves gross, the rate per mile
              and the booking stats alike (tick other types as pass-throughs on
              Settings as you confirm them). The schedule's share is{" "}
              <span className="text-light">dated</span>: a load settles on the
              split in force on its delivery day — your January loads on the
              pre-trailer row (no trailer share), everything from Feb 3, 2026 on
              the trailer's 8% — and the load page says which ("settled on the
              Feb 3, 2026 schedule"). Fix a row in place on Settings; start a
              new one from the day the split changed. So the keep is{" "}
              <span className="text-light">measured</span> from the window’s own
              loads (net ÷ gross — {live.keepPct} on today's window), not assumed from the schedule: you judge a
              load all-in, so the rate to book divides by what you actually keep
              of an all-in dollar — the way Score a Load always has. Anything
              above <span className="text-light">{live.book}</span> (with your empty
              miles counted) makes money. This is a{" "}
              <span className="text-light">cash</span> break-even — costs from
              your last <span className="text-light">six complete months</span>{" "}
              of P&L plus loan principal (no depreciation), stepping forward on
              the 1st of each month; your payroll is inside that cost, so
              break-even already pays you and the margin goal sits on top. Every
              surface that shows it names the window (“cash · {live.window}”), the
              months still unfiled, and the spread between the months — because
              a missing month silently shrinks the basis.
            </Why>
          </Metric>

          <Metric
            title="The rate ladder"
            answers="Where your booked rate lands against your targets."
            sources={[{ label: "Dashboard", to: "/dashboard" }]}
          >
            <MiniLadder ladder={targets.bookingLadder} spec={targets.specLadder} />
            <Formula>
              walk-away = break-even · minimum / target / strong = break-even ×
              (1 + your tier %)
            </Formula>
            <Why>
              The rungs are SET with{" "}
              <span className="text-light">the rate dial</span> on Settings — a
              slider denominated in the margin you're pricing for; the three
              rungs derive as target −5 / target / target +5 in margin space
              and convert to markups. Two currencies, one number: a{" "}
              <span className="text-light">markup</span> is measured against
              cost, a <span className="text-light">margin</span> against
              revenue — +25% over break-even yields a ~20% margin (markup ÷ (1
              + markup)), which is why the ladder prints both on every rung.
              Slide the dial left in a soft market to stay competitive; below
              your goal it warns, below 0% it flags every mile as paying the
              agency. There are <span className="text-light">two dials</span>,
              both shown on the ladder above.{" "}
              <span className="text-light">Standard</span> (seeded +10 / 20 / 30%)
              is your everyday freight and carries the full bar plus your rate
              marker. <span className="text-light">Specialized</span> (seeded +35 / 45 /
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
              It's also <span className="text-light">required</span>: a blank
              deadhead means unknown, and the scorer won't treat unknown as
              zero. Already sitting at the shipper? Type 0 and mean it.
            </Eg>
            <Why>
              The break-even here is per{" "}
              <span className="text-light">driven</span> mile (your cost/mile ÷
              your blended keep), so it's apples-to-apples with the all-in rate
              — the same break-even the Market page books against, and the verdict
              panel names the basis it graded on: the window, the months filed,
              the spread between them, and a warning when a month is unfiled. The
              Dashboard's <span className="text-light">net break-even</span> is
              a different number on purpose: cost per loaded mile, in net
              dollars, beside your net $/mi. The verdict maps to whichever tier set fits the load:{" "}
              <span style={{ color: "var(--color-status-negative-text)" }}>SCRAP</span> below break-even,{" "}
              <span style={{ color: "var(--color-amber-hi)" }}>THIN</span> under target,{" "}
              <span style={{ color: "var(--color-cat2)" }}>SOLID</span> at target,{" "}
              <span style={{ color: "var(--color-hot)" }}>PRIME</span> at strong. A legal
              load hits those at your Standard tiers (target / strong — whatever your dial derives); an
              oversize, hazmat, or heavy load has to reach the Specialized ones
              (the Specialized dial’s). A line under the verdict names which set graded it.
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
              the load leaves you — off your own outbound history: what a day of the
              freight OUT of that market earns you, how much of it there's been, and
              how many agents source it, graded{" "}
              <span style={{ color: "var(--color-cat2)" }}>STRONG</span> /{" "}
              <span className="text-light">FAIR</span> /{" "}
              <span style={{ color: "var(--color-amber)" }}>SOFT</span> / thin against your own
              daily bars — strong clears your margin goal's day, soft doesn't cover
              the day's break-even, thin under four loads. So a fair-paying load that drops you somewhere you can't reload reads
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
              set in Settings). It's the line Pulse's pace bar grades you against,
              in gross booking dollars.
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
              (from the Fed's FRED data) overlaid on a second axis, both from zero so
              a 3% index move reads as 3%. Beside the call,{" "}
              <span className="text-light">your accepted loads</span> shows
              where your rungs sit among your own recent loads of the same type
              — a Standard rung among standard loads, a Specialized rung among
              oversize and hazmat — and only once eight or more of that type are
              in the window. It is evidence, never "the market": only loads you
              took are in it, so it reads your discipline as much as the market.
              The call reads that percentile; nothing here suggests a move on its
              own.
            </Why>
            <Why>
              <span className="text-light">You vs. the market</span> (under the
              barometer) compares your standard freight's median over the index's
              last three months against the three before — the same calendar
              months on both sides, at least eight loads a side, the counts
              printed; with fewer it says not enough to compare. If the market's
              up and you're flat, that's money on the table you can chase —
              lanes, agents, negotiation. If you're both down, it's the cycle, not
              you. The small <span className="text-light">freight-market chip</span>{" "}
              on the dashboard header reads the same signal as the call: firming
              or softening only once the index has held two prints and the move
              isn't diesel's. All of it is a national read — your own lane heat
              still comes from your own loads.
            </Why>
          </Metric>

          <Metric
            title="The call — one move per tier"
            answers="One engine judges each tier on its own freight — the median of at least five loads of that type in 90 days against its own rungs — and lets the index nudge it one step only once the signal has held two prints and isn't a fuel move."
            sources={[{ label: "Market", to: "/market" }]}
          >
            <Why>
              There's no national oversize spot price to book against, so the
              call doesn't invent one. It reads two things: where your own recent
              median for that freight type sits against that tier's rungs —
              break-even, floor, target, strong — and what the{" "}
              <span className="text-light">FRED freight index</span> is allowed
              to say. The index's three-month move must pass 2.5% (the series'
              own noise is 1.2%), hold the same read on{" "}
              <span className="text-light">two consecutive prints</span>, and
              not be a fuel move — diesel moving more than 10% the same way in
              the same window explains it, because the index carries fuel
              surcharges and your surcharge passes fuel through at 100%. The
              call prints how many prints agree, so you can wait for three.
            </Why>
            <Why>
              Below break-even beats every direction. Between break-even and
              your floor: hold the line at the floor. Between floor and target: a
              held firming signal says <span className="text-light">raise one
              step</span>, to your target; a held softening signal says hold with
              your cushion to the floor shown; anything else holds. At or above
              target, a held firming signal pushes one step to your strong rung.
              Fewer than five loads of a type in 90 days: not enough to call,
              with the count. And when the index and your own loads disagree —
              firming while your target already sits at the 70th percentile or
              higher of your accepted loads of that type, or softening while it
              sits under the 45th — the call says{" "}
              <span className="text-light">evidence disagrees</span>, and holds.
              The index's nudge for the rate dials follows the same rule: one
              step of two points from where the dial sits, never under goal + 5,
              and only on a held signal.
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
              plan</span> appears under the call — built from{" "}
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
              loads run from the towns around it — matched with the state, so
              Charleston, WV never lands in the Charleston (SC) market), then the{" "}
              <span className="text-light">nearest city you've already mapped</span>{" "}
              within 75 miles, then the{" "}
              <span className="text-light">nearest hub within 75 miles whose
              market you already have</span>, and only then a new hub market;
              twin hubs under 50 miles apart share one market (Joliet and Gary
              are Chicago's, Fort Worth is Dallas's, Ontario is Los Angeles's,
              Elizabeth is New York's, Carlisle is Harrisburg's, Tacoma is
              Seattle's, Washington is Baltimore's, Stockton is Sacramento's,
              Allentown is Philadelphia's). For a genuinely remote spot it's a{" "}
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
              <span className="text-light">Dollars per day</span> — the fourth
              column, beside the $/mi. A load pays for the days it owns the
              truck, not just the miles, so{" "}
              <span className="text-light">$/day = gross ÷ days from pickup to
              delivery, inclusive, never under one day</span>. Rolled up for a
              region, a market or a lane it is{" "}
              <span className="text-light">total gross ÷ total days</span> —
              weighted, so a two-day $2,300 load and a five-day $5,220 load read
              $1,074 a day together rather than the $1,097 neither of them
              earned. The colours are your own{" "}
              <span className="text-light">daily target from the rate ladder,
              per calendar day</span> — true monthly cost spread over every day
              of the month, worked or not, lifted to your margin goal — because
              a load owns calendar days: the truck sits under it over the
              weekend the same as over a Tuesday. Green at or above that
              target, amber at or above break-even, red below it. (That is your
              own P&L talking, not the $/mi column's fixed rate tiers beside
              it — the two columns wear the same three colours but answer to
              different yardsticks.) A row under the{" "}
              <span className="text-light">3-load bar</span> still prints its
              figure but carries no colour, and a lane whose loads have no
              pickup date yet shows an em dash — never a guessed dollar. The
              same number rides the Foreman's rate cell, the agent page, the
              Relationships Review scorecard, the Agencies rows and the load
              header.
            </Why>
            <Why>
              The same typical-vs-blended rule governs every $/mi in the market
              ledger and the repeat-lane board on that page — see{" "}
              <span className="text-light">The market ledger — out and in</span>,
              below, for what the two halves of a market row mean and how the map
              shades them.
            </Why>
          </Metric>

          <Metric
            title="The market ledger — out and in"
            answers="Every market you touch, in two halves: what the freight born there pays you, and what a delivery there leaves you."
            sources={[{ label: "Lanes", to: "/lanes" }]}
          >
            <Formula>
              one row per market · OUT = loads born here · IN = when you deliver
              here
            </Formula>
            <Why>
              Spot oversize barely repeats a <span className="text-light">lane</span>{" "}
              — you've run 57 different market-to-market lanes and only four of
              them twice. It does repeat <span className="text-light">markets</span>,
              so the unit on the Lanes page is the market, and every market gets a
              row with two halves. Lanes keep one honest board of their own
              underneath: the ones you've run more than once.
            </Why>
            <Why>
              <span className="text-light">OUT</span> — the freight born there:
              how many loads, the typical $/mi, the $/day, and how many agents
              source it. Its grade is not a second opinion: it is the{" "}
              <span className="text-light">Load Scorer's own market rule</span>:
              the market's typical <span className="text-light">ex-fuel $/day</span>{" "}
              — a load's gross minus its fuel surcharge, per calendar day the
              load owned — against the ladder's own daily bars, the same two
              numbers that colour the $/day column beside it. Strong when a day
              of that freight earns what your margin goal needs, soft when it
              doesn't cover the day's break-even, fair between, thin under four
              loads. Per day, not per mile, because your book pays $9.57 a loaded
              mile under 400 miles and $5.21 over 1,200 while the same loads earn
              the truck the same per day, and the fuel surcharge is a pass-through
              that rose 46¢ a mile this year. The bars are your cost, so switching
              the window never moves them. Score a Load grades a delivery market
              on this page's 12-month window against the same bars, so the two
              can never disagree about whether a market is worth loading in.
            </Why>
            <Why>
              <span className="text-light">IN</span> — what a delivery there
              leaves you: how many deliveries, the typical empty miles to your
              next pickup, the days you waited, and what that next load paid. That
              is the number the page was missing, and it has its own section
              below. Home time is read from your{" "}
              <span className="text-light">logged home trips</span> — a
              Thursday-to-Monday stint counts as home, not idle — or from a gap
              over a week, and a home stint's reload miles stay out of the
              market's median along with its days. Idle counts{" "}
              <span className="text-light">weekdays</span>, so a Friday
              delivery reloading Monday is one day, not three. Empty miles come
              from the <span className="text-light">odometer</span> — your
              chain copies the previous end reading as the next start, so the
              next load's window minus its loaded miles is the empty run — and
              from the planned deadhead only when the readings can't say. The
              grade is the reload <span className="text-light">in dollars</span>{" "}
              — those miles at your cost per driven mile plus the idle weekdays
              at the truck's fixed cost per calendar day — as a share of the load
              it led to: strong at or under your margin goal, soft at or past
              twice it, fair between. See <span className="text-light">The reload
              cost</span>, below.
            </Why>
            <Why>
              <span className="text-light">Regions</span> flips the same ledger to
              the nine freight regions. The rows aren't averaged from the state
              rows — every rate, every $/day and both grades are recomputed from
              the region's own loads, so a region row is the same arithmetic on a
              bigger pile.
            </Why>
            <Why>
              The <span className="text-light">windows</span> are 12 months (the
              default), this year, and all time. The old 30/60/90 tabs came off:
              on a spot book they were showing four loads and a blank map, which
              is a smaller sample than any of these numbers can survive.
            </Why>
            <Why>
              The <span className="text-light">map</span> shades one metric at a
              time — OUT $/mi, IN reload miles, or volume — and both money metrics
              read the same way, brighter is better, so the IN ramp is inverted
              (fewer empty miles is the bright end). A market with a{" "}
              <span className="text-light">single load</span> on the metric's own
              side is hatched rather than shaded: one haul is a story, not a
              market. A market you've never touched stays dark. Hover a state for
              its ledger row, click it to pin the row and open its detail, and
              flip "lanes" on to draw your repeat lanes as lines. The blue pin is
              where you'll be empty next, straight from the Foreman.
            </Why>
          </Metric>

          <Metric
            title="The reload cost — what a stop leaves you"
            answers="The price of getting empty in a market, in dollars: the empty miles to your next pickup at your cost per mile and the weekdays you waited at the truck's day rate, as a share of the load it led to."
            sources={[{ label: "Lanes", to: "/lanes" }]}
          >
            <Formula>
              reload $ = empty miles × cost per driven mile + idle weekdays ×
              fixed cost per calendar day · graded as reload $ ÷ the next load's
              gross
            </Formula>
            <Why>
              Nothing new to enter: this is read straight off your own{" "}
              <span className="text-light">load sequence</span>. Sort every
              delivered load by pickup date, and the load after this one tells you
              what this stop cost — how far you ran empty to reach it, and how many
              days the truck sat first. The market's figures are the{" "}
              <span className="text-light">median</span> reload and the average
              idle over every delivery there.
            </Why>
            <Why>
              A deadhead of <span className="text-light">0</span> on the next load
              is <span className="text-light">"not logged"</span>, never free. It
              is missing data, so it is left out of the median rather than counted
              as a reload that cost you nothing — which would flatter every market
              you've been sloppy in.
            </Why>
            <Why>
              Home time is not a market's fault. A logged{" "}
              <span className="text-light">home trip</span> between a delivery and
              the next pickup marks the leg home — your Thursday-to-Monday stints,
              which no gap rule catches — and a gap over seven days still does.
              Those legs are shown in the detail as "(home)" and kept out of every
              median and every grade. Idle counts{" "}
              <span className="text-light">weekdays</span>: a Friday delivery
              reloading Monday waited one day, not three.
            </Why>
            <Why>
              The <span className="text-light">grade</span> is in dollars, against
              your own cost. A reload costs its empty miles at your cost per driven
              mile plus each idle weekday at the truck's fixed cost per calendar day
              — a day waiting is usually the bigger half. That cost as a share of
              the load it led to is the grade:{" "}
              <span className="text-light">Strong</span> at or under your margin
              goal, <span className="text-light">Soft</span> at or past twice it,{" "}
              <span className="text-light">Fair</span> between, over at least four
              deliveries. <span className="text-light">Thin</span> = fewer than
              four deliveries, or no reload ever logged there — shown, never graded.
              The detail prints every leg's dollars and share.
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
            title="The cash board — this period and the next"
            answers="Two pay periods, the one you’re running and the next: what each one earns against what it carries, and the Ops you’ll have after it settles."
            sources={[{ label: "Cash Flow", to: "/cashflow" }]}
          >
            <Formula>
              deposit = the period's loads at net — delivered, on the road or
              booked, each expected at its rate; or a normal planning week when
              they say less — minus the fuel advance drawn against them, the
              fixed deductions, and the shortfall the statement before carried
              forward · a statement under zero lands
              nothing and carries into the next · a TONU counts only once the
              statement pays it · ending = your Ops number ± every line dated
              after it, each on the day it hits the bank: last period’s deposit,
              this period’s deposit, payroll, the accrual, the bills, the card
              leftover, a run money day · verdict = the lowest day of the two
              periods against the float
            </Formula>
            <Why>
              A pay period runs Wednesday to Tuesday. Whatever it delivers goes
              on the next Wednesday’s statement and lands Thursday — and that
              money belongs to the period that earned it. So each column is one
              period, and every line sits on the day the money moves: the Ops
              number you typed, last period’s deposit on its Thursday, payroll
              on Friday, the accrual on the period’s own miles the Friday after
              it closes, the bills on their draft days, the fuel advance on
              Monday, this period’s own deposit on the Thursday after it
              closes, then the ending — <span className="text-light">dated
              after the last thing that moved</span>, which in a normal week is
              Friday’s payroll, not Thursday’s deposit.
            </Why>
            <Why>
              <span className="text-light">The ending is what the bank holds,
              not what the period earned.</span> Two timelines run at once here.
              The deposit, the fuel and the advance belong to the{" "}
              <span className="text-light">pay period</span> that earned them —
              that is what each column groups. Payroll and the bills are plain{" "}
              <span className="text-light">calendar</span> events: they happen
              on their day whatever period it is. The bank only keeps the second
              one. And because a period’s accrual pays the Friday <i>after</i>{" "}
              it closes, the current column’s last day falls inside the next
              period’s week — the same Friday its payroll leaves. So each
              ending counts every line of <span className="text-light">both</span>{" "}
              columns dated on or before its day: settlement lands Thursday,
              payroll goes Friday, and the ending is what is left after both.
              A line the previous ending has already taken off still shows in
              its own period, greyed, saying so — you booked the freight, you
              should see the payroll — but it is never subtracted twice. A faint line is already
              inside your number. The deposit is the statement’s actual once the
              vault has it; before that it is the delivered and expected loads —
              or a normal planning week when they say less, so one small booking
              never replaces the week — minus the advance (
              <span className="text-light">
                the average of your last four statements that drew one
              </span>
              , since a CARD PRE-TRIP lump is never the same number twice; the
              figure in Assumptions is only the fallback until four are on
              file) and the fixed deductions, minus whatever the statement before
              carried forward: a home week’s statement nets under zero, lands
              nothing, and Landstar takes it out of the next one. A TONU is never
              counted until the statement pays it — the shipper decides what it
              pays. A TONU is
              also never a <span className="text-light">booked load</span>: it
              shows as its own line and counts only as the cash the statement
              paid. Load counts, gross and every rate per mile — the Loads page
              header, Brandie's card and season, the truck's and trailer's
              earnings — ignore it. The fuel and the miles of an open or future period run at
              the pace of the last four pay weeks that actually ran, so a home
              stint never dilutes them; the odometer takes over as readings
              land. The current column opens on your latest number — an{" "}
              <span className="text-light">OPS NOW</span> balance or the Friday
              snapshot; on a day with both, the one typed later. Only what’s
              dated on or after it comes off; a snapshot already holds its own
              day, including the accrual you moved before typing it, while a
              morning check still has that day ahead. Whatever an earlier period
              still owes after your number — its Friday accrual, its fuel
              advance, its bills — rides into the current column on its own
              date. The fuel line{" "}
              <span className="text-light">can go either way</span>: the advance
              minus what you actually burned. Spend less and the rest is still
              on the card, so it comes back to Ops. Spend more — or run a week
              with no loads, and so no advance at all — and the difference came
              out of Ops, which is why that line is allowed to be negative. It
              used to be floored at zero, and four of your statements since
              August read $0 when you had genuinely fuelled past the draw.
              The verdict reads the{" "}
              <span className="text-light">lowest day</span> across both
              periods, not the two endings: a board can end above the float and
              dip under it on a Sunday in between. That is why the badge says{" "}
              <span className="text-light">every day clears</span> or{" "}
              <span className="text-light">a day under the float</span> while
              each ending speaks only for its own period — the two can
              disagree, and now they no longer borrow each other’s words. Tap
              either deposit to type the figure you know — Landstar has told you
              and the statement has not landed yet. It is{" "}
              <span className="text-light">saved to your account</span>, so the
              phone, the laptop and Brandie all read the same number, and it
              stands until the real statement arrives and the board takes that
              instead. Tap the ✕ to drop it. (Until v1.268.0 it was kept on
              whichever browser typed it, which meant the laptop and the phone
              could disagree and clearing site data lost it.)
            </Why>
          </Metric>

          <Metric
            title="OPS NOW — the number you type"
            answers="Your Ops balance right now, typed from the bank app — the one number the cash board and the Plan page open on until the next Friday snapshot."
            sources={[
              { label: "Cash Flow", to: "/cashflow" },
              { label: "Plan", to: "/status" },
            ]}
          >
            <Why>
              Type it any day, from the bank's balance. The board's current
              column and the Plan page both open on the{" "}
              <span className="text-light">latest</span> of an OPS NOW check and
              a Friday snapshot — on a day with both, the one typed later. A
              check typed in the morning still has the day's lines ahead of it
              (payroll, a bill), so they come off after it; a snapshot holds its
              own day, including the accrual you moved before typing it. On a
              day a deposit is dated, the form asks one more thing:{" "}
              <span className="text-light">Today's deposit · it has landed</span>
              , unticked because you usually type before the ACH posts.
              Unticked, the board keeps that deposit{" "}
              <span className="text-light">still to come</span> and adds it after
              your number; ticked, it is already inside the balance you typed.
              The field is not there on any other day. Dash refuses a future
              date. A check replaces only the Ops number — Maintenance, Tax and
              the Vault still read the snapshot.
            </Why>
          </Metric>

          <Metric
            title="ASSUMPTIONS — the planning inputs behind the board"
            answers="Nine numbers you set once on the Cash Flow page; the board and the Six-Month Road read them wherever a statement or a log hasn't measured the real thing yet."
            sources={[{ label: "Cash Flow", to: "/cashflow" }]}
          >
            <p className="text-sm text-muted-text mb-2">
              <span className="text-light">Weekly revenue fallback</span> — the
              planning week a period's deposit falls back to when its loads say
              less. <span className="text-light">Weekly payroll</span> — the
              Friday line in every period.{" "}
              <span className="text-light">Weekly fuel advance</span> — the
              advance the board takes off a deposit unless the fills pass it.{" "}
              <span className="text-light">Avg weekly settlement deductions</span>{" "}
              — the fixed-deduction line until the statements measure it.{" "}
              <span className="text-light">Monthly depreciation</span> — the
              forecast's non-cash add-back.{" "}
              <span className="text-light">Federal and state tax rate</span> —
              the forecast's tax lines.{" "}
              <span className="text-light">Financing floor</span> — the
              forecast's principal paydown, entered negative.{" "}
              <span className="text-light">Tax catch-up earmark</span> — what
              the Six-Month Road's true spendable subtracts.
            </p>
            <Why>
              A blank one is not zero: where a projection needs an input you
              haven't set, the board says so and asks for it rather than
              printing a number that looks real. The float line is the plan's,
              edited on the Plan page; the bills live with your obligations on
              Expenses.
            </Why>
          </Metric>

          <Metric
            title="What dash refuses — a blank is never zero"
            answers="Where a number needs an input you haven't given, dash says what is missing and where to set it, instead of running with $0 in its place and printing a figure that looks real."
            sources={[
              { label: "Cash Flow", to: "/cashflow" },
              { label: "Plan", to: "/status" },
              { label: "Loads", to: "/loads" },
            ]}
          >
            <p className="text-sm text-muted-text mb-2">
              <span className="text-light">On the cash board</span>, a planning
              input that isn't set refuses the line that needs it — "Can't place
              this line — weekly payroll isn't set. Set it in ASSUMPTIONS ›" —
              while every other line keeps its number; the ending, which needs
              every line, waits ("waits for payroll — one blank input, no
              ending"), and so does the verdict.{" "}
              <span className="text-light">On the Plan page</span>, an account
              with no balance typed reads "no balance typed", never $0 of your
              floor; a ladder stage with no target refuses its rung; a money day
              whose accrual is unknown — a gap in the odometer chain, or a
              snapshot that stored no miles — or whose Maintenance floor is unset
              refuses to run and says why.{" "}
              <span className="text-light">On a load</span>, a deadhead that was
              never logged is unknown, not zero: the grade reads "—" with "needs
              the odometer" rather than scoring the load as if it ran empty for
              free.
            </p>
            <p className="text-sm text-muted-text mb-2">
              <span className="text-light">The load form</span> won't save a load
              as delivered until it has its end odometer and its delivery date:
              "A delivered load needs its end odometer and its delivery date —
              empty miles, the Friday accrual and break-even all read them." The
              server holds the same rule, and the database behind it.{" "}
              <span className="text-light">The server</span> refuses, in a
              sentence, a blank keep percentage (it would zero every load's net),
              a share above 100%, a tax rate typed as 15 instead of 0.15, an
              odometer typed as 0, a P&amp;L month that isn't the 1st, P&amp;L
              lines that don't add to the file's totals, a statement that doesn't
              end on your settlement day, a snapshot missing an active account's
              balance, a fill-up dated in the future or read a thousand miles
              below the fill before it, and a load priced with no settlement
              schedule at all.
            </p>
            <Why>
              A missing input used to become a number. Payroll not set meant $0
              payroll in the projection; a deadhead never logged meant zero empty
              miles and the best possible grade; a snapshot with no Tax balance
              meant UNMET ($0 of $9,500). Each read as a fact. Now the figure
              that needs the input is the one that stops, names the input and
              points at the box, and nothing around it is touched. When a page's
              data fails to load, it says so in red — "Couldn't load the P&amp;L —
              the server didn't answer. Retry ›" — with dashes in the tiles,
              never the empty state that would claim you have no data.
              Everything dash is working around is listed on the Integrity page;
              the Dashboard shows the count while anything is open.
            </Why>
          </Metric>

          <Metric
            title="The Integrity page — what dash is working around"
            answers="Which inputs dash is standing on a fallback for, or skipping a record over, right now — and where to fix each one."
            sources={[{ label: "Integrity", to: "/integrity" }]}
          >
            <p className="text-sm text-muted-text mb-2">
              <span className="text-light">The page lists</span> every input a
              number is quietly working around: a month with no P&amp;L, a
              delivered load with no end odometer, a bill with no draft day, a
              statement that says one thing while a load says another, a per-diem
              rate below the IRS number — or none whose start day has arrived, so
              today is unpriced. Each row
              names the record, says which figures read it and by how much, shows
              the day the gap began, and links to the box that fixes it.{" "}
              <span className="text-light">There are two severities.</span> Money
              means a figure stands on a fallback or two sources disagree, so a
              number you read is off. Data means a record is incomplete and the
              numbers skip it. Money reads first, then data, newest first inside
              each.{" "}
              <span className="text-light">A dispatcher sees the data rows</span>
              {" "}— the records she enters — and a count of just those; the money
              rows are the owner's.{" "}
              <span className="text-light">The chip</span> on the Dashboard's top
              line, "INTEGRITY · 7 OPEN ›", opens the page, and it hides at
              zero.
            </p>
            <Why>
              A row leaves the moment its fix lands — dash re-reads the inputs
              every time the page opens — and nothing is dismissed by hand. There
              is no "ignore" button, because a number standing on a fallback is
              still standing on it whether or not you looked away. The footer
              line says what passed, so an empty list means every input was
              checked and present, not that nothing was looked at.
            </Why>
          </Metric>

          <Metric
            title="The settlements — Landstar's actuals"
            answers="What Landstar actually paid you each week, straight from parsed Contractor Statements."
          >
            <p className="text-sm text-muted-text mb-2">
              The company server reads every settlement statement, proves the
              parse against the statement's own printed totals to the penny,
              and feeds the week into dash: revenue, fuel advances, other
              deductions, net deposit, escrow balances. A week that's already
              archived is never overwritten.
            </p>
            <p className="text-sm text-muted-text mb-2">
              Three things happen with it: the cash board's fuel and
              deduction lines read the statements once they land (an open period
              runs its fuel at the pace of the last four pay weeks that ran; two
              deduction buckets, because the
              first settlement of each month carries the insurance stack —
              advances excluded so fuel is never counted twice); every load
              page gets a <span className="text-light">settlement verification</span>{" "}
              line — Landstar's gross vs the net this page promised, penny-diffed,
              cumulative across later adjustments; and when Landstar reaches
              back into a paid load (admin fees, permit and escort fees hitting
              late), the adjustment is named, dated, and counted — a named fee
              reads amber unless it pulls the load's revenue under zero, which
              reads red, as does an unexplained shortfall.
            </p>
            <p className="text-sm text-muted-text mb-2">
              Loads whose settled money doesn't match the load page's promise
              wear a <span className="text-light">SETL ±$</span> chip on the
              loads table — the disagreements surface themselves; you never
              hunt for them. And the load page's settlement line carries an{" "}
              <span className="text-light">open statement →</span> link that
              opens the most recent statement that touched the load.
            </p>
            <p className="text-sm text-muted-text mb-2">
              The board's columns: <span className="text-light">Statement · cash</span>{" "}
              (the statement's date and the Thursday the money lands), Loads,
              Revenue, Refunds, Advances, Other deductions, Net deposit. A net
              under zero reads <span className="text-light">carried</span>, because
              Landstar takes it out of the next statement rather than drafting
              you.
            </p>
            <Caveat title="FIX chips mean a load isn't in dash">
              A settlement line for a load number dash doesn't know gets a FIX
              chip on the settlements board — usually a load that never got
              entered. Enter the load and the next feed links it.
            </Caveat>
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
              double-counted. Set weeks off on any forecast month — the chart marks the
              ones you've set. The board header shows{" "}
              <span className="text-light">when the archive last changed</span>{" "}
              and <span className="text-light">which months feed the baseline</span>{" "}
              — when an import moves the forecast, the header says why. The
              earmark line shows{" "}
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
              so they’re the ones to quote. The driver page’s{" "}
              <span className="text-light">margin lever</span> grades this same
              number pooled over the last three closed months when the archive
              has them, and says so; with fewer it falls back to the app's
              season estimate, labelled as such.
            </Why>
          </Metric>

          <Metric
            title="Per diem — the meal-allowance deduction"
            answers="Your days out, turned into the M&IE tax deduction. Unmarked days count as full days out — you only mark home time and half days."
            sources={[{ label: "Per Diem", to: "/per-diem" }]}
          >
            <Formula>
              for each rate in force: (full days × rate + half days × 75% × rate)
              · summed · × 80% deductible
            </Formula>
            <Eg>
              A week out = 5 full days + 2 half days (the days you left and got
              home). Each day away overnight counts; the departure and return
              days are 75%. The deduction card prints one line per rate:{" "}
              <span className="text-light">
                22 full + 3 half days × $80 (from Jan 1, 2026)
              </span>
              .
            </Eg>
            <Why>
              As a DOT hours-of-service driver you deduct{" "}
              <span className="text-light">80%</span> of the IRS special rate
              (vs 50% for everyone else). The rate is a table of{" "}
              <span className="text-light">dated rows</span> on the Settings page
              — $69 before 2026, $80 from Jan 1, 2026 — and every day is priced by
              the row in force that day, so a past year keeps the rate it was
              filed at while the IRS's next number starts the day it changes. Add
              a row when the IRS publishes (Oct 1 in a change year); a year with
              no change needs no row. A day no row covers is never priced at $0
              or at a guess: the card refuses in the line that needs it —{" "}
              <span className="text-light">
                Can't price 12 days (Jan 1, 2024 – Jan 12, 2024) — a per-diem rate
                for those days isn't set. Set it in SETTINGS ›
              </span>{" "}
              — and the total waits. The 80% deductible share stays on Settings
              beside the table. The default assumes the
              life: from <span className="text-light">Aug 18, 2026</span> on, an
              unmarked day counts as a <span className="text-light">full day
              out</span> automatically — tap a day only to mark it half
              (departure/return), home, or back to automatic. Marking home time
              matters twice: it keeps the deduction honest AND it drives the
              hometime warning and the truck page's home/idle split. Days before
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
              where the truck actually sits, and the Scorer, the Lanes map and
              the Foreman start from it — loads and fuel already stamp it,
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
              A fill is a <span className="text-light">full tank</span> when you
              say so: the fill-up form's{" "}
              <span className="text-light">Filled to the top</span> tick, on by
              default because filling up is your rule — untick a partial, and it
              rolls into the next full instead of closing a window. (Until Nov
              2026 "full" was a guess, 120 gallons or more; every older fill was
              marked by that rule, so history reads as it did.) Measuring
              full-to-full is why it's honest — actual pump gallons against
              actual odometer miles. The fill-up form also takes an optional{" "}
              <span className="text-light">APU hours</span> reading — nothing to
              do with MPG, but it re-anchors the APU's{" "}
              <a href="#apu-hours-the-projection" className="text-amber-light">
                hours projection
              </a>{" "}
              for free while you're standing at the truck.
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
              <span className="text-light">30-day average</span> (it needs at
              least two tanks inside that month; one tank alone has nothing
              honest to compare against), and the tank's{" "}
              <span className="text-light">$/gal versus the national price</span>.
              Green is better, red is worse. It leans on your{" "}
              <span className="text-light">average</span> rather than just the
              last tank on purpose, so one heavy oversize run doesn't read as a
              slump. Beat your best MPG and it marks a{" "}
              <span style={{ color: "var(--color-amber-hi)" }}>NEW BEST</span>;
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
              <span style={{ color: "var(--color-amber-hi)" }}>
                gallon-weighted average $/gal
              </span>{" "}
              from the fuel log, against the{" "}
              <span style={{ color: "var(--color-status-info-text)" }}>
                national retail diesel price
              </span>{" "}
              (the U.S. EIA weekly number, rolled up to monthly). Buying under
              the national line means you're routing fuel stops well. The card
              above the chart, <span className="text-light">You vs. national diesel</span>,
              puts every gallon you bought in the{" "}
              <span className="text-light">last 30 days</span> against the
              EIA's latest week — a lifetime average against this week's price
              would flatter you every time diesel climbs.
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
                surcharge covers = FSC collected ÷ fuel spend · par = (price −
                peg) ÷ price × loaded share × MPG bonus
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
              100% of the fuel surcharge — but a surcharge was{" "}
              <span className="text-light">never meant to cover 100% of
              fuel</span>. The schedule pays only the price ABOVE a contract peg
              (~$1.29/gal — fitted from Landstar's own weekly report in Nov 2026), on <span className="text-light">loaded miles
              only</span>: you eat the first peg-dollars of every gallon and
              every deadhead mile by design. So the card grades you against{" "}
              <span className="text-light">par</span> — what the schedule
              actually owes at this month’s diesel price and your deadhead —
              green at or above par, amber within 5 points, red beyond (FSC
              leaking: loads booked light on surcharge, or deadhead eating the
              collected miles). Par moves with diesel: pricier fuel raises it,
              cheap fuel lowers it. Your MPG above the schedule’s 5.81 base is a
              real bonus you keep. Only months with logged fuel are counted, so
              a month you haven't entered fills for never shows a false 0%. The
              card headlines the{" "}
              <span className="text-light">last complete month</span> — a month
              still running has fuel it hasn't bought yet and surcharge it hasn't
              collected, so grading it would swing with the calendar. The running
              month shows under the tiles as "so far", with its figures and no
              grade.
            </Why>
            <Why>
              <span className="text-light">Par from Landstar's own scale.</span>{" "}
              What Landstar publishes each week is not a band table but the
              scale's answer for the week — the Ranger report's header line,{" "}
              <span className="text-light">National Average $6.292 → .86 cents
              per mile</span>, with the regional PADD points beside it. Paste
              that line on the Settings page once a week; dash keeps every week
              and fits the scale from the points (cents per mile = (price − peg)
              ÷ base mpg — one report with its PADD lines already pins it to the
              cent). A month then reads the scale at its national average diesel
              price (this week's price for the month still running): expected
              surcharge = loaded miles × the rate, and par is that against the
              fuel spend. The card says which it used —{" "}
              <span className="text-light">
                par on Landstar's scale at this week's $6.292: 86¢ a loaded mile
                · the week's printed rate
              </span>
              . A pasted band table, if you ever have one, wins over the scale
              while it is in force; with neither the card says{" "}
              <span className="text-light">par · estimate</span> and uses the peg
              formula above; with a scale but no national price for the month it
              says <span className="text-light">par unknown</span> and grades
              nothing, rather than hiding the estimate behind Landstar's name.
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
              open). The <span className="text-light">CLAIM FILED</span>{" "}
              checkbox beside the load’s status marks an OS&amp;D or damage
              claim — owner or dispatcher — and breaks the agent’s on-time,
              claim-free streak in Relationships.
              <br />
              <br />
              <span className="text-light">
                Whose customer is this load?
              </span>{" "}
              Under the stamps sits{" "}
              <span className="text-light">the agent’s customer on this load</span>
              — three options, one lit. It exists because dash used to read a
              load’s <span className="text-light">origin</span> as the agent’s
              market on every load, and that is wrong the moment their customer
              is the one receiving: a machine picked up at a tradeshow
              marshalling yard in Atlanta and delivered to the agent’s own
              shipper in Troutman, NC put Atlanta in his footprint and left
              Troutman out, so the Foreman measured from a parking lot he will
              never load out of again.{" "}
              <span className="text-light">Shipper</span> is the default and
              right for almost every load — the origin is the market, nothing
              changes. <span className="text-light">Receiver</span> makes the{" "}
              <span className="text-light">destination</span> the footprint
              point and treats the shipper as a one-time place.{" "}
              <span className="text-light">Neither</span> is a load that says
              nothing about where their freight lives — a spot load through a
              stranger — and puts no point on the map at all. Owner or
              dispatcher sets it, and it can be changed any time.
              <br />
              <br />
              <span className="text-light">dash suggests; it never decides.</span>{" "}
              When this load’s receiver keeps turning up on the agent’s other
              loads and its shipper doesn’t, a line appears under the control —
              “C R Onsrud is the shipper on 5 other loads with Mike — this one
              is theirs coming home” — with a{" "}
              <span className="text-light">Mark Receiver</span> button. Nothing
              is written until you tap it. If both parties recur, or neither
              does, dash says nothing rather than guess, and a load you have
              already marked is never nagged. Reading the mark: the Foreman’s
              proximity, the 150-mile capacity list, the parked 75-mile harvest
              group, the call screen’s “hauled from”, the footprint count on
              the Friday five, and the step that promotes a market an agent{" "}
              <span className="text-light">claimed</span> to one a load{" "}
              <span className="text-light">proved</span> (a load marked Neither
              promotes nothing). Lanes, the markets pages and the load’s own
              origin and destination are untouched — those are about where the
              truck went, not whose freight it was.
            </Why>
          </Metric>

          <Metric
            title="In / out times & dwell"
            answers="Log when you arrived and left each stop; dwell is how long the dock held you."
          >
            <Formula>
              the clock starts at the LATER of (arrived, appointment start)
              <br />
              <span style={{ color: AMBER_HI }}>
                dwell = departed − that moment
              </span>
            </Formula>
            <Eg>
              Arrived 8:30a, left 10:45a against an 8:30a appointment →{" "}
              <span className="text-light">2h 15m</span>. Same stop, but you
              rolled in at 6:00a for a 9:00a appointment and left at 10:45a →{" "}
              <span className="text-light">1h 45m</span>, not 4h 45m. Overnight
              stays are handled.
            </Eg>
            <Why>
              Dwell is a verdict on the{" "}
              <span className="text-light">facility</span>, so it only counts
              time that was theirs. Getting there three hours early is your
              call, not theirs — charging them for it would make every dock you
              arrive early at look slow. It starts on exactly the same moment
              detention does, which is why the two numbers can be read side by
              side. If a dock takes you early and lets you go before your
              appointment even comes round, that is{" "}
              <span className="text-light">0m</span> — they did you a favour, and
              favours don't score against them.
            </Why>
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
              no appointment, or you arrived late →{" "}
              <span style={{ color: AMBER_HI }}>nothing to claim</span>
              <br />
              otherwise free time ends at the LATER of (arrived, appointment
              start) + your free hours
              <br />
              <span style={{ color: AMBER_HI }}>
                detention = time released past that
              </span>
            </Formula>
            <Eg>
              8:00 appointment, 3h free, rolled in at 6:00 → the clock still
              starts at 8:00 and runs out at 11:00; released 12:20 ={" "}
              <span className="text-light">1h 20m</span>. A window{" "}
              <span className="text-light">8:00–23:00</span> that you back into
              at 11:10 runs out at <span className="text-light">14:10</span> —
              three hours from when you got there, not from when the window
              closes. Released 20:15 ={" "}
              <span className="text-light">6h 05m</span>.
            </Eg>
            <Why>
              Two rules, and both are about what a shipper will actually pay.
              First, <span className="text-light">late forfeits it</span> — miss
              a hard appointment, or miss the end of your window, and there is
              no claim however long you then sit. Same if the stop never had an
              appointment at all: there was no clock to be held past. The load
              says which of those it is, so you can tell a lost claim from a
              missing appointment you can still go and set.
              <br />
              <br />
              Second, the clock starts at the{" "}
              <span className="text-light">later of your arrival and the
              appointment's start</span>. Early never earns detention. But a{" "}
              <span className="text-light">wide window does not cost you the
              claim</span> — inside the window the three hours run from when you
              arrived. (This is a correction: the clock used to start at the
              window's END, which made a 7:00–23:45 window unclaimable no matter
              how long you sat. One real load was holding{" "}
              <span className="text-light">6h 05m</span> that read as zero.)
              Whether it actually pays is the shipper's call,
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

          <Section title="The line above the table">
            <p className="text-sm text-muted-text mb-2">
              The Loads page answers whatever your filters currently show, in
              one line:{" "}
              <span className="text-light">
                so many loads in this view · so many earning · gross ·
                $/loaded mi
              </span>
              . The count is the rows on your screen — filter to TONUs and it
              says how many TONUs there are.
            </p>
            <p className="text-sm text-muted-text mb-2">
              <span className="text-light">Earning</span> is the second,
              smaller number, and it only appears when the two differ. Cancelled
              and TONU runs are on the screen but out of the money: they are
              real records you want to see, and they never carried a linehaul.
              Holding them out is what keeps the gross and the $/loaded mile
              honest — without it a cancelled load would quietly drag the rate
              down as though you had hauled it for nothing.
            </p>
            <p className="text-sm text-muted-text">
              So "14 loads in this view · 12 earning" means two of the fourteen
              are dead runs, and the gross beside it is the twelve.
            </p>
          </Section>

          <Section title="The odometer carries itself">
            <p className="text-sm text-muted-text mb-2">
              A new load opens with its{" "}
              <span className="text-light">start odometer already filled</span>,
              carried from the last completed run — the load before it, or the
              trip that ran after that load, whichever came later. Trips have
              tiled onto the chain this way for a long time; loads only started
              in v1.271.0, which is why they used to be filled in at the end of
              the week from memory.
            </p>
            <p className="text-sm text-muted-text mb-2">
              It always says <span className="text-light">where the number came
              from</span> — "from load 4333118's delivery", "from the Nov 3
              trip" — so a wrong carry is obvious rather than trusted. It only
              ever fills an <span className="text-light">empty</span> field;
              it never corrects something you typed, and it never touches a
              load you are editing.
            </p>
            <p className="text-sm text-muted-text mb-2">
              Three things it will <span className="text-light">not</span> do.
              It never carries from a <span className="text-light">fuel
              stop</span> or a shop visit — those are points inside a run, not
              the end of one, and a fill sitting mid-load would start the next
              load before the current one finished. It never carries from a
              TONU or a cancelled load, which never moved. And while anything is{" "}
              <span className="text-light">still rolling</span> it leaves the
              field blank and says so, because the end of the current run
              isn't known yet. A blank gets filled in; a wrong number gets
              trusted.
            </p>
            <Caveat title="Log the trip and the load will not swallow it">
              The carry can only see what's in the book. Log a deadhead on the
              Trips page <i>after</i> you've already created the next load and
              that load's start will be too low — it will swallow the trip's
              miles and count them twice. Integrity watches for exactly that
              shape and raises it as{" "}
              <span className="text-light">a trip running inside a load's
              odometer window</span>, whatever put the number there.
            </Caveat>
          </Section>

          <Section title="The loads table, by color">
            <p className="text-sm text-muted-text mb-2">
              A left bar and row tint tell you what needs action, worst first:
            </p>
            <div className="text-sm flex flex-col gap-1.5">
              <p>
                <span style={{ color: "var(--color-status-positive-text)" }}>● Green</span> — in transit.
                These lift into an "On the road" group up top, so what's rolling
                is always in view.
              </p>
              <p>
                <span style={{ color: "var(--color-amber)" }}>● Amber</span> — detention
                owed &amp; unpaid (with a "DET" chip).
              </p>
              <p>
                <span style={{ color: "var(--color-status-negative-text)" }}>● Red</span> — a TONU fee
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

          <Section title="Paperwork on a load">
            <p className="text-sm text-muted-text mb-2">
              Every load page has a{" "}
              <span className="text-light">Paperwork</span> panel — chips for
              the rate con, POD, freight bill, trip sheet, and
              anything else filed for that load. Tap a chip to open the
              document.
            </p>
            <p className="text-sm text-muted-text mb-2">
              You never upload documents in dash. Drop them (any name, any
              mess) into the <span className="text-light">DTS Inbox</span>{" "}
              folder on any device — the company server's filing robot renames
              them to convention, files them in the vault, and the chip
              appears here on its own. If the robot can't tell what something
              is, it waits at{" "}
              <span className="text-light">approve.dts-ops.co</span> for a
              one-tap answer.
            </p>
            <Caveat title="Chips won't open off the tailnet">
              Documents open from the company server, which lives on the
              private tailnet — your device needs the Tailscale app signed in.
              No tailnet, no paperwork (that's the security model working).
            </Caveat>
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
              the rate. A <span className="text-light">cancelled</span> load was
              never a visit: it adds nothing to a facility's count, its last
              visit or its dwell.
            </p>
          </Section>

          <GroupHeading>The driver page</GroupHeading>

          <Metric
            title="Bottleneck — your three profit levers"
            answers="Your season net breaks into Rate × Utilization × Margin. The driver page's levers row shows all three, grades each, and names the weakest — the one holding you back."
            sources={[{ label: "Driver page", to: "/drivers" }]}
          >
            <Formula>
              net ≈ Rate × Utilization × Margin · bottleneck = the weakest lever
            </Formula>
            <Why>
              The row is three figures, each with its grade word —{" "}
              <span className="text-light">
                BELOW · MINIMUM · TARGET · STRONG
              </span>{" "}
              — and the basis it stands on printed under it:{" "}
              <span className="text-light">Rate</span> — your gross rate per
              driven mile — against the booking ladder, the same number and the
              same ladder as the Dashboard's "Rate vs your floor" (six months of
              P&amp;L, divided by your keep), <span className="text-light">Utilization</span> against
              the 70/80/85% benchmark, and{" "}
              <span className="text-light">Pretax margin</span> against bands
              that ride your <span className="text-light">margin goal</span>{" "}
              (Settings): goal −5 / goal / goal +5 — at your researched 15%
              that's <span className="text-light">10 / 15 / 20%</span>, and the
              same bands grade every margin in the app, so no page can
              contradict another. The margin itself reads from your{" "}
              <span className="text-light">QBO books</span> (the last three
              closed months on the Cash Flow archive, depreciation included),
              because the accountant-grade number is the one to trust. The tile
              names its basis; until the archive has months it falls back to
              the app's season estimate, labeled as the op margin. The three
              mask each other — a great rate with the truck sitting still nets
              mediocre — so one plain sentence under the row names whichever
              is lagging and what to do about it (two lagging → tackle the
              weakest first). When all three reach Target it reads{" "}
              <span className="text-light">Every lever at target or better</span>;
              before a full month of data it says the grades are still
              building. The quarter's P&amp;L figures — income, operating profit, after
              notes — are the quarter rows of the Money tab's{" "}
              <span className="text-light">months table</span>.
            </Why>
          </Metric>

          <Metric
            title="Hometime — days since you were home"
            answers="Days since your most recent home day. Past your threshold, the card flags it so a long stretch out doesn't sneak up on you."
            sources={[
              { label: "Dashboard", to: "/dashboard" },
              { label: "Driver page", to: "/drivers" },
            ]}
          >
            <Formula>
              today − your last home day (a Per Diem home mark, or a trip with
              purpose Home — whichever is later) · flag when it crosses your
              threshold
            </Formula>
            <Eg>
              Home June 27, today July 15 →{" "}
              <span className="text-light">18 days out</span>. Under a 42-day
              target it stays calm; cross 42 and it turns to a red flag.
            </Eg>
            <Why>
              It reads home days from the Per Diem calendar and from any trip you
              logged with purpose <span className="text-light">Home</span> — the
              later of the two is your last home day. (The per-diem deduction
              still reads the marks alone.) Set the threshold on the Settings
              page (default{" "}
              <span className="text-light">42 days</span> — six weeks, the stretch
              you actually run). Until Settings has answered, the chip waits
              rather than grading you against a guess. No home marks yet? The
              card nudges you to start rather than guess.
            </Why>
          </Metric>

          <GroupHeading>The truck</GroupHeading>

          <Metric
            title="Utilization — how hard the truck runs"
            answers="The share of days the truck was under a load — pickup to delivery — lifetime: since the later of the truck's in-service date and your first logged load, and the tile prints that date ('lifetime since Jan 6, 2026'). Idle days pull it down."
          >
            <Formula>days under load ÷ days in window</Formula>
            <div className="mt-3">
              <UtilBar active={138} total={190} />
            </div>
            <Eg>
              Under a load 138 of 190 days →{" "}
              <span className="text-light">73%</span>. The day breakdown splits
              the rest: <span style={{ color: "var(--color-status-info-text)" }}>home</span> days (you
              marked home and ran nothing) vs{" "}
              <span style={{ color: "var(--color-status-negative-text)" }}>idle</span> days (no load, not
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
              benchmark is a fair read. It is also the driver page's
              Utilization lever, graded on the same 70 · 80 · 85% bars. The{" "}
              <span className="text-light">Drivers</span> list shows the truck's
              odometer — driven miles, not loaded miles.
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
              { label: "Fuel", to: "/fuel-entries" },
            ]}
          >
            <Formula>miles between full tanks ÷ gallons burned</Formula>
            <Eg>
              1,400 mi on 200 gal = <span className="text-light">7.0 mpg</span>.
              Best tank is your best MPG; the rolling average is the number
              each new tank is judged against.
            </Eg>
          </Metric>

          <Metric
            title="Fuel + shop + note per mile — what the truck itself costs you"
            answers="What the truck itself costs per mile: fuel, the shop log, and its note. The truck page carries the truck note, the trailer page the trailer note, and the Fleet dashboard rolls both into one figure for the truck and its trailer. It is NOT the P&L's all-in cost per mile — insurance, plates, the office and everything else — which lives on Expenses and is what the rate to book stands on."
          >
            {/* Illustrative round numbers — the app computes yours live. */}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <ChainBox top="$0.70" bottom="fuel / mi (30-day)" />
              <span className="text-muted-text">+</span>
              <ChainBox top="$0.10" bottom="maintenance / mi" />
              <span className="text-muted-text">+</span>
              <ChainBox top="$0.50" bottom="note / mi" />
              <span className="text-muted-text">=</span>
              <ChainBox top="$1.30" bottom="fuel + shop + note / mi" />
            </div>
            <Formula>
              fuel (30-day tank windows) + maintenance ÷ miles driven + note ÷
              miles per month
            </Formula>
            <Why>
              The real cost of keeping the truck rolling — the note included, so the
              number reflects what actually leaves your pocket each mile. Fuel is
              the <span className="text-light">30-day tank-window rate</span> —
              the same number the Fuel page answers with — because diesel prices
              swing too much for a long average to mean anything today (it ran
              on 90 days until September 2026, when diesel climbed $1.45 a
              gallon in three months and the 90-day blend was quoting seventy
              cents under the pump), and because dollars and miles must cover
              the{" "}
              <span className="text-light">same stretch of road</span> (miles you
              drove before you started logging fuel don't get to water it down).
              No full-tank window in the last 30 days means fuel is unknown, so
              the whole number waits rather than showing a fuel-less total. The
              same payment also shows on the payoff tracker, but as balance paid
              down, not a per-mile cost — and that tracker reads the statement
              balance less every monthly draft since the day it was read, so the
              July balance no longer stands in November. Retype a balance on
              Expenses → the notes and that day becomes its as-of date; the
              tracker names the statement, its day and the drafts it counted
              beneath the meter. The Fleet tab prints
              the P&amp;L's all-in cost per mile beside this one so the two are
              never confused: this is the truck's own running cost; the P&amp;L
              figure is the cost basis.
            </Why>
          </Metric>

          <Metric
            title="Revenue per mile — what each mile earns"
            answers="The truck's net revenue spread over every mile it drove — its earning efficiency."
          >
            <Formula>truck net revenue ÷ total miles driven</Formula>
            <Eg>
              $141k ÷ 55,000 mi = <span className="text-light">$2.57 / mi</span>
              . Miles/month rounds it out — how hard the truck runs.
            </Eg>
          </Metric>

          <GroupHeading>Compliance</GroupHeading>

          <Section title="Compliance — Mark renewed, and the cycle it keeps">
            <p className="text-sm text-muted-text">
              Every paper on Compliance carries a{" "}
              <span className="text-light">Mark renewed</span> button beside Edit.
              It opens a short sheet with the four things a renewal changes: the
              day it was renewed (today), the next expiry, the new document
              number (the old one, ready to be overtyped) and a note. When the
              item has a cadence — <i>renews every 24 mo</i> — the next expiry
              comes prefilled at that many calendar months past the renewal day,
              clamped to the end of the month it lands in (Jan 31 + 1 mo is Feb
              28, never Mar 3); an item with no cadence leaves it blank and asks
              you for the date. A <span className="text-light">medical</span> card
              never prefills more than 24 months out, whatever cadence the row
              carries — the DOT card is good for two years at most, so a longer
              cadence is a typo, not a plan. Saving writes down the cycle you just closed —
              what it was issued, what it was due, the number it carried — and
              keeps it as history under the row:{" "}
              <span className="text-light">
                renewed Sep 18, 2026 · was due Oct 2, 2026
              </span>
              , with "n earlier" folding the ones before it. Only then do the
              item's own dates roll forward, so the clock cells go green the same
              second, and nothing touches the cadence unless you change it. The{" "}
              <span className="text-light">CDL row</span> renews the same way —
              it lives on the driver record rather than in the paper list, so the
              sheet asks for the new expiry outright and writes it back to the
              driver. Owner and dispatcher both.
            </p>
          </Section>

          <GroupHeading>The shop</GroupHeading>

          <Metric
            title="Maintenance — four units, four meters"
            answers="What's due on the truck, the transmission, the trailer and the APU — each counted on the meter it actually runs on."
            sources={[{ label: "Maintenance", to: "/maintenance" }]}
          >
            <Why>
              A clock belongs to one <span className="text-light">unit</span>,
              and every unit reads its own meter. The{" "}
              <span className="text-light">truck</span> counts miles off its
              odometer. The <span className="text-light">trailer</span> has no
              hubodometer, so by your rule its meter{" "}
              <span className="text-light">is the truck's odometer</span>: its
              reading today is the truck's latest reading, named with its source
              ("606,217 · truck 580991 · the Nov 7 fill"), and a trailer service
              is pre-filled with the truck's last reading on or before the
              service date — overtype it if you read the dash that day. The
              old hub seed on the trailer record is gone. The{" "}
              <span className="text-light">APU</span> counts{" "}
              <span className="text-light">engine hours</span> — it runs while
              the truck sits, so its odometer says nothing about its wear.
              Transmission work gets its own board but still rides the truck's
              odometer. Any clock can also carry a{" "}
              <span className="text-light">month</span> interval; when an item
              has two, whichever is further along is the one that decides.
            </Why>
            <Why>
              A clock with no baseline — no last-done reading to count from —
              reads <span className="text-light">No baseline</span> and shows a
              dash, not a zero. Give it one by tapping the row, or just log the
              next service that completes it.
            </Why>
            <Why>
              The <span className="text-light">pace</span> that turns miles left
              into a date is the median of your last three{" "}
              <span className="text-light">complete</span> months of driving. The
              month you're in is left out — on the 3rd it would read as a crawl
              and on the 28th as a sprint — so a due date never jumps because of
              where the calendar happens to sit.
            </Why>
          </Metric>

          <Metric
            title="APU hours — the projection"
            answers="Your APU has no odometer and nobody reads its meter weekly, so dash carries the last reading forward instead of going blind."
            sources={[
              { label: "Maintenance", to: "/maintenance" },
              { label: "Fuel", to: "/fuel-entries" },
            ]}
          >
            <Formula>
              hours today = your last reading + road days since × this APU's own
              hours per road day
            </Formula>
            <Why>
              A <span className="text-light">road day</span> is a day the truck
              was working — a load in progress, plus a single empty day between
              two loads, because that's repositioning, not sitting. Days at the
              house add nothing: the APU isn't running. The{" "}
              <span className="text-light">rate</span> is learned from your own
              last two readings — the hours they differ by, divided by the road
              days between them. Until there are two, dash assumes{" "}
              <span className="text-light">8 hours per road day</span>, roughly
              a ten-hour break with the unit on.
            </Why>
            <Why>
              A reading is just a row you already keep: the hour meter on an APU
              service, or the optional{" "}
              <span className="text-light">APU hours</span> box on a fuel-up.
              Whichever is newest re-anchors the count, so typing the meter at
              the pump resets the drift for free.
            </Why>
            <Why>
              Anything projected is <span className="text-light">marked</span>.
              The number wears a <span className="text-light">~</span> and the
              page says which reading it's counting from ("est. from road days
              since Sep 3"); an exact number means the meter was read today. If
              no reading exists at all, the page says{" "}
              <span className="text-light">needs a reading</span> and every APU
              clock sits out — dash will not draw hours the meter never gave.
            </Why>
          </Metric>

          <Metric
            title="Due next and the unit boards"
            answers="Overdue, Soon and Then across the whole truck, then every clock shelved by the unit it belongs to."
            sources={[{ label: "Maintenance", to: "/maintenance" }]}
          >
            <Why>
              The plate at the top of the Schedule is{" "}
              <span className="text-light">Due next</span>, and it always has
              the same three slots:{" "}
              <span className="text-light">Overdue</span>,{" "}
              <span className="text-light">Soon</span>,{" "}
              <span className="text-light">Then</span>. Each one holds the most
              urgent clock at that level, with its unit and what's left — miles,
              hours or days. A slot with nothing in it says so ("nothing
              overdue"), so a bad week never gets to fill the plate twice. Under
              it sit four boards —{" "}
              <span className="text-light">Truck</span>,{" "}
              <span className="text-light">Transmission</span>,{" "}
              <span className="text-light">Trailer</span>,{" "}
              <span className="text-light">APU</span> — and each board's heading
              carries that unit's current meter.
            </Why>
            <Why>
              Inside a board the rows are sorted by urgency, and the clocks that
              are fine fold behind a{" "}
              <span className="text-light">"n more · fine"</span> line — tap it
              to see them. Every row's right-hand number is what is{" "}
              <span className="text-light">left</span> on the lens that is
              furthest along — so a clock that's overdue on months shows the
              days, not comfortable hours — coloured by how close it is; tap the
              row to edit the clock or set a baseline by hand. To keep a clock
              of your own, use{" "}
              <span className="text-light">+ Add clock</span> at the top of the
              page, beside <span className="text-light">Log service</span>.
            </Why>
          </Metric>

          <Metric
            title="Logging a service"
            answers="One sheet for a shop visit: what it was on, the meter, who did it, where, and which clocks it reset."
            sources={[{ label: "Maintenance", to: "/maintenance" }]}
          >
            <Why>
              Pick the <span className="text-light">unit</span> first — it
              decides which meter the sheet asks for.{" "}
              <span className="text-light">Truck</span> wants an odometer,{" "}
              <span className="text-light">Trailer</span> the truck's odometer
              that day (pre-filled from the last reading on or before the date,
              with its source named),{" "}
              <span className="text-light">Both</span> reads the one odometer on
              one invoice, and <span className="text-light">APU</span> reads
              hours.
              The <span className="text-light">City</span> box is the same
              picker the load form uses: pick a suggestion and it fills the
              state for you, storing a clean "Carlisle, PA".
            </Why>
            <Why>
              <span className="text-light">Completes</span> is the part that
              matters — tick the clocks this visit reset and they restart from
              this service's date and reading. An APU clock you tick takes its
              new baseline from the <span className="text-light">APU hours</span>{" "}
              on the sheet; leave that blank and the clock keeps its date but
              still needs a meter before it can count. Costs on this page are{" "}
              <span className="text-light">vendor pricing only</span> — what
              each shop charges you — and are never rolled into your P&amp;L.
            </Why>
          </Metric>

          <GroupHeading>The website</GroupHeading>

          <Section
            title="The website — who's looking"
            sources={[{ label: "Website", to: "/website" }]}
          >
            <p className="text-sm text-muted-text">
              Every page of delgadotruckingservices.com tells dash when it
              opens. One of those is a{" "}
              <span className="text-light">page view</span> — one page, opened
              once. A <span className="text-light">visitor</span> is a browser
              seen on a day: the day, the address it came from and the browser
              it used are scrambled together with a secret only the database
              holds, and what's kept is the scramble. The same person reading
              four pages this afternoon is one visitor and four page views;
              tomorrow that same person is a brand new visitor, because the day
              was part of what got scrambled. The address itself is never
              written down — there is nothing on this page, or behind it, that
              points at a person.
            </p>
            <Why>
              The switch at the top sets the{" "}
              <span className="text-light">window</span> — 7 days, 30 days, 90
              days or 12 months — and every figure, bar and list under it counts
              only that stretch. dash remembers the one you left it on. The bars
              are one per day, except on 12 months, where they're one per week
              — 52 bars, and the leftover days at the far end fold into the
              oldest bar, so that one can cover eight to thirteen days and no
              visitor falls off the chart; the last bar is the day (or week)
              you're in, so it's still filling up. A day nobody came keeps its
              slot as a thin line rather than closing the gap.
            </Why>
            <Why>
              <span className="text-light">Came from</span> is the site that
              linked them to you — google.com, facebook.com — and{" "}
              <span className="text-light">direct</span> is a browser that named
              no one: typed in, opened from a bookmark, or tapped inside an app
              that keeps that to itself. It is the normal answer for someone you
              handed a card to. <span className="text-light">States</span> come
              from where the address looks like it sits, which is close but not
              exact — a phone on a carrier's network can land a state or two
              off, so read the list as a shape, not as an address book.
            </Why>
            <Why>
              Crawlers that announce themselves — Google's, Bing's, the rest of
              the well-behaved ones — are dropped before they ever reach dash.
              One that lies about what it is counts as a visitor once and then
              rate-limits itself out, so a quiet week with one odd spike is
              usually a machine, not a customer. Every time on the page is{" "}
              <span className="text-light">Central</span>, and a day ends at
              midnight Central — the same clock the rest of dash keeps.
            </Why>
            <Why>
              <span className="text-light">Subscribers</span> are the people who
              asked for the Logbook. When someone fills in the form on an entry,
              the address lands <span className="text-light">here first</span> —
              that row is your copy of the list, and it keeps only the address,
              when it arrived, which entry they signed up from, and which
              version of the consent line they were shown. No IP, no browser; a
              mailing list has no use for either. Only after the row is safe
              does dash hand the address to{" "}
              <span className="text-light">Kit</span>, the service that does the
              sending: Kit mails the confirmation, mails every entry, carries
              the physical address the law wants in the footer, and owns the
              unsubscribe link. If Kit ever changes under you, every address you
              have ever collected is already in dash.{" "}
              <span className="text-light">Latest signups</span> shows the
              newest 25, full addresses, newest first; the{" "}
              <span className="text-light">Subscribers</span> figure counts the
              window you're on and the line under it counts the whole list. Your
              own test signups — any address with{" "}
              <span className="text-light">+logbook-test</span> before the @ —
              stay in the Latest list but never in the count, and the line under
              it says how many it left out.
              <br />
              <br />
              The status on each row is where that address stands with Kit.{" "}
              <span className="text-light">pending</span> — in dash, not yet
              handed over. <span className="text-light">sent</span> — Kit has it
              and has mailed them; it's the normal, quiet state while you wait
              on the person. <span className="text-light">confirmed</span> —
              they clicked the link in that email and are really on the list.{" "}
              <span className="text-light">unsubscribed</span> — they left
              through Kit's link, which is theirs to use and nothing for you to
              undo; if they ever sign up again the row wakes back up as pending.{" "}
              <span className="text-light">failed</span> — Kit refused the
              address or couldn't be reached. Nothing is lost, the address is
              still yours here, but that row is a flag to read rather than
              something that retries itself. Until the Kit key is set on
              Railway, nothing can be
              handed over at all, so every signup simply sits as{" "}
              <span className="text-light">pending</span> — that is the expected
              state before the account exists, not a fault. The moment the key
              is in place, the Sync door pushes everything that has been
              waiting, oldest first.
            </Why>
            <Why>
              <span className="text-light">Sync to Kit</span>, on the Latest
              signups board, is the one button: it hands every waiting address
              to Kit and asks Kit how the ones it already holds are doing — a
              reader who clicked the confirmation link comes back as{" "}
              <span className="text-light">confirmed</span>, one who left comes
              back as <span className="text-light">unsubscribed</span>. Until
              the key is on Railway the button says so and moves nothing.
            </Why>
            <Why>
              Readers are not asked to confirm. Kit puts an address that comes
              through the API straight on the list, so a row reads confirmed on
              the next sync; the double opt-in that a Kit form does on its own
              never fires for the site's form, and a subscriber created
              inactive stays inactive even after clicking. Leaving is still one
              click, in every email Kit sends.
            </Why>
          </Section>

          <div
            className="my-6 border-t"
            style={{ borderColor: "var(--color-hairline)" }}
            aria-hidden="true"
          />
          <GroupHeading>Agents</GroupHeading>

          <Section
            title="Agent ratings"
            sources={[{ label: "Agents", to: "/agents" }]}
          >
            <p className="text-sm text-muted-text mb-4">
              You set these by hand — your call on who to work with. Each shows
              as a plain label on every agent card ("GOOD · 4 / 5") and on the
              agent's page, where it also carries the day you last changed it
              ("GOOD · 4 / 5 · set Jun 3, 2026"). The colour means only good,
              caution or bad.
            </p>
            <div className="flex flex-col gap-3">
              {RATINGS.map(([r, desc]) => (
                <div key={r} className="flex items-center gap-4">
                  <div className="w-36 shrink-0">
                    <RatingLabel rating={r} />
                  </div>
                  <p className="text-sm text-muted-text">{desc}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-text mt-4">
              Beside the rating on the agent's page sits their{" "}
              <span className="text-light">12-month all-in rate</span> and its
              grade word, from the same engine as the agents leaderboard: all-in
              gross ÷ every mile driven, for their delivered loads picked up in
              the last 12 months, graded on your booking ladder —{" "}
              <span className="text-light">STRONG · TARGET · ABOVE FLOOR ·
              UNDER WALK-AWAY</span>. The grade waits for three delivered loads
              lifetime; until then it reads "not yet graded · 2 of 3 loads".
            </p>
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
              <span style={{ color: "var(--color-amber-hi)" }}>⚠ flag</span> marks where your
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
            title="The agents leaderboard — by desk"
            sources={[{ label: "Agents", to: "/agents" }]}
          >
            <Metric
              title="Desk rate, grade and share"
              answers="Which desks pay you best per mile, over the last 12 months?"
            >
              <Formula>
                rate = Σ gross ÷ Σ (loaded + deadhead miles), delivered loads picked up in the last 12 months, per desk
                <br />
                graded = 3+ delivered loads, lifetime, across the desk's people
                <br />
                share = desk gross ÷ gross of every attributed load in the window
              </Formula>
              <Why>
                It is the <span className="text-light">same rate as Tiers</span>{" "}
                — all-in gross over every mile you drove for the load — read at
                the desk instead of the person, so a desk and its people can
                never disagree about the arithmetic. A load counts for the desk
                it was booked under, and an agent with no agency becomes a desk
                named by their posting code. No miles logged means no rate, never
                $0.00.
              </Why>
              <Why>
                A desk needs <span className="text-light">three delivered
                loads</span> before it is graded; until then it sits under
                "Not yet graded" and shows its rate without a verdict. The grade
                is your booking ladder's: <span className="text-light">STRONG</span>{" "}
                at the strong bar, <span className="text-light">TARGET</span> at
                the target bar, <span className="text-light">ABOVE FLOOR</span>{" "}
                between walk-away and target, and{" "}
                <span className="text-light">UNDER WALK-AWAY</span> below your
                break-even. It is a ranking of who pays, not a race.
              </Why>
              <Why>
                Beside the rate: <span className="text-light">share</span> of the
                year's attributed freight, <span className="text-light">$ / day</span>{" "}
                (gross per calendar day the freight owned the truck),{" "}
                <span className="text-light">loaded</span> (loaded miles as a
                share of all miles driven), <span className="text-light">detention</span>{" "}
                (paid of confirmed-billable), the last load, and{" "}
                <span className="text-light">your rating</span> — the desk's if
                you set one, otherwise its people's. Under the table, the best
                graded desk per freight class (Standard or Specialized), judged
                only on that class's loads and only with three of them.
              </Why>
            </Metric>
          </Section>

          <div
            className="my-6 border-t"
            style={{ borderColor: "var(--color-hairline)" }}
            aria-hidden="true"
          />
          <Metric
            title="Relationships — the book of agents"
            answers="Five buckets — Tier 1, Tier 2, Tier 3, Prospects, Parked — graded by all-in RPM against the live rate ladder. The owner sets every tier; dash only suggests."
            sources={[{ label: "Relationships", to: "/relationships/tiers" }]}
          >
            <Why>
              Four views under one shell — <span className="text-light">Today
              · Call list · Tiers · Review</span> — with one agent sheet behind
              every row and <span className="text-light">+ PROSPECT</span> on
              every tab. The <span className="text-light">TIERS</span> view is
              the book graded REL-01 v2.0’s way. <span className="text-light">
              Tier 1, 2 and 3</span> hold only agents with an established
              footprint — <span className="text-light">three or more delivered
              loads</span> — graded by their average all-in RPM (gross dollars
              over every mile, loaded and deadhead, trailing twelve months)
              against the same rate ladder the Scorer holds a load to:{" "}
              <span className="text-light">Tier 1 at or above Target · Tier 2
              at or above Minimum · Tier 3 at or above Walk-away</span>. An
              established agent under walk-away wears a red LOSING MONEY chip —
              no tier, and a park suggestion. The bands are the ladder’s own
              steps, so when your costs move the bands move with them; nothing
              is stored. <span className="text-light">Prospects</span> are
              everyone still being courted — added by hand, or hauled once or
              twice — and they graduate at their third delivered load, when the
              row moves to NEEDS A TIER for you to place.{" "}
              <span className="text-light">Parked</span> is hidden from the
              working list: an agent you parked with a written reason, or one
              gone dormant (no load, no two-way contact, nothing at all for 180
              days). Search finds them here, and the Foreman surfaces a parked
              agent’s freight when the truck is within 75 miles — harvest it,
              no outreach owed. This book is by{" "}
              <span className="text-light">person</span>; for the same freight
              rolled up by the desk they work — an agency, its codes and what it
              has delivered — see{" "}
              <span className="text-light">Agencies — the book by agency</span>{" "}
              below.
              <br />
              <br />
              <span className="text-light">The owner sets every tier, always
              with a written reason</span>, from the agent sheet; the reason
              lands in the tier history and dash never re-tiers anyone. Where
              the numbers disagree with a placement the row wears a{" "}
              <span className="text-light">SUGGEST → TIER 1</span> chip (or
              SUGGEST → PROSPECT for a tiered agent under three loads), the
              section head counts how many are suggested in, and the sheet
              shows the evidence — “$6.94 all-in · above Strong · 3 loads” —
              with the recommended button pre-lit and the reason prefilled.
              Dispatch sees the tier with a lock, nothing to press.
              <br />
              <br />
              <span className="text-light">One proactive touch per agent per
              week.</span> Capacity heads-ups, milestone and holiday notes,
              reactivation and prospecting calls are proactive and count; a
              close-out, a load in progress, freight-bill work, anything the
              agent sent you, and the owner’s own thread are operational or
              inbound and never count. Log a second proactive reason in the
              same week and the form refuses with a plain sentence and offers
              to <span className="text-light">fold</span> it into the message
              that already went out — or LOG ANYWAY with a note saying why. A
              reached call or anything inbound is what resets an agent’s
              cooling clock; a voicemail or a one-way email does not. Every
              write shows its error by name, and a mis-logged touch undoes from
              the toast or deletes from the agent’s timeline; the metrics
              recompute, nothing rots.
              <br />
              <br />
              <span className="text-light">Today is the day’s job.</span> The
              plate at the top follows ADMIN-02’s week and the queue beneath it
              does the thinking. <span className="text-light">Monday</span> is
              the capacity pass: from where the truck goes empty next — the
              Foreman’s anchor, the same coordinate cache — every active agent
              whose freight sits within 150 straight-line miles (their
              delivered-load origins plus the markets they named), nearest
              first, each with the §7 heads-up drafted in their name and yours,
              email or text. COPY puts it on the clipboard; LOG SENT records
              it. One at a time, on purpose — there is no “log all”. Parked
              agents never get the email; the ones within 75 miles are counted
              for the Foreman to harvest instead. <span className="text-light">
              Tuesday and Thursday</span> lead with reactivation — the lapsed
              prospects who hauled before, most loads first, then the quietest;
              the first one still clear this week is the plate’s hero and
              Thursday adds prospecting. <span className="text-light">Wednesday</span> is the
              nurture flags: a load-count crossing at 5 · 10 · 25 · 50 · 100,
              an on-time and claim-free streak at 10 · 20 · 50 (untimed loads
              are neutral; a claim breaks it), the first-load anniversary for
              two weeks, and in season the Thanksgiving and New Year notes
              (ten days before Thanksgiving through the day; Dec 22 to Jan 2).
              Each flag sits until it is logged or skipped — a skip is
              recorded so the flag doesn’t return; the owner personalizes the
              Tier 1 holiday versions.{" "}
              <span className="text-light">Friday</span> is the five — agents
              contacted, footprints, inbound offers, loads booked above
              break-even, days empty — with COPY THE FIVE for the owner and a
              hygiene line naming who still lacks a phone, a preferred channel
              or a footprint. Weekends carry only close-outs and callbacks, and
              preview Monday’s pass.
              <br />
              <br />
              Beneath the plate, in a fixed order: <span className="text-light">
              NOW</span> — every delivery in the last fourteen days with no
              close-out logged, its draft one tap away (operational, so it
              never touches the cap); the plate’s own rows; <span className="text-light">
              CALL BACK</span> — every “call back Thursday” you promised on a
              log whose day has come, standing until something settles it (they
              call, you reach them, or any proactive touch — a close-out or
              freight-bill note does not). A promised call is never refused by
              the cap: it logs with the override and a note saying why. One
              reason per agent per day — an agent owed a call back gets that
              row and no plate or list row. Then the next three of the day’s
              list and a door to the Call list. A row for an agent who already had this
              week’s proactive touch is ghosted with a TOUCHED chip and is not
              offered a second one — when a milestone lands on a Monday
              capacity agent the plate folds it into{" "}
              <span className="text-light">one combined message</span> and the
              contact records both reasons. DONE TODAY lists what was logged,
              each with an undo. Nothing here is “due” by a clock anymore; the
              old Tier 1 weekly / Tier 2 monthly list is gone.
              <br />
              <br />
              <span className="text-light">Cooling is the owner’s flag, not
              Dispatch’s to-do.</span> At the bottom of Today, every tiered
              agent past their threshold with no two-way contact — Tier 1 at 21
              days, Tier 2 at 42, Tier 3 at 90 — plus anyone who flags inside
              the next two weeks (“flags Oct 9 if nothing changes”). A reached
              call, anything inbound or a load resets the clock; a voicemail
              or a one-way email does not. Dispatch sees it read-only; the
              owner taps a row to log their own thread — Owner personal,
              uncapped. It never creates a task and never sends anything.
              The <span className="text-light">CALL LIST</span> runs on these
              buckets too — reactivation and prospects, one row, one call
              screen (its own section below).
              <br />
              <br />
              <span className="text-light">Review is where the month gets
              judged and signed.</span> Month or quarter, stepped back as far as
              you like. The scorecard, the tier-move log and the quarter’s
              checks rest on the period you are standing on; cooling, the
              milestones, the cap audit, hygiene and IS IT WORKING always read
              today. <span className="text-light">IS IT WORKING</span> is the
              one number — inbound share since system start, a plain fraction
              until ten attributed loads, then a percent — cut by each agent’s
              current tier and laid out month by month.{" "}
              <span className="text-light">RE-TIER SUGGESTIONS</span> lists
              every agent whose all-in RPM band on the live ladder disagrees
              with the tier they hold, the evidence on the row (“$6.94 all-in
              on 3 loads · above Strong”), an established agent still without a
              tier under NEEDS A TIER, and an established agent under walk-away
              as LOSING MONEY with a park suggestion.{" "}
              <span className="text-light">APPROVE</span> writes the tier with
              the reason prefilled from the evidence — editable, never empty —
              and lands a row in the tier history with who and when;{" "}
              <span className="text-light">HOLD</span> records your “not now”
              against that evidence, and the suggestion stays quiet until the
              numbers behind it change. Nothing re-tiers itself, and Dispatch
              sees every board read-only — “the owner sets tiers” where the
              buttons would be.
              <br />
              <br />
              Beneath it: <span className="text-light">COOLING</span>, the
              same owner’s flag Today carries — monitoring, never a to-do;{" "}
              <span className="text-light">MILESTONES</span> waiting and sent
              this month; the <span className="text-light">CONTACT CAP</span>{" "}
              audit, which should read zero agents over one proactive touch
              this week and names the two touches when it doesn’t; a{" "}
              <span className="text-light">HYGIENE</span> line — phones,
              preferred channels, footprints, best time to call — each name a
              door into the book; <span className="text-light">TIER MOVES</span>{" "}
              this month, straight from the history with their reasons;{" "}
              <span className="text-light">GONE QUIET</span>, every Tier 1 or 2
              with no two-way contact in thirty days; and the{" "}
              <span className="text-light">SCORECARD</span> — ninety days per
              agent: loads, net, gross per driven mile graded on the booking ladder (a load with no odometer window and no known deadhead is left out and counted),{" "}
              <span className="text-light">$/day</span> — the window's gross
              over the days their freight owned the truck, weighted and
              coloured against your own daily target from the rate ladder, per
              calendar day (see{" "}
              <span className="text-light">Lane rate — typical vs blended</span>
              ) — deadhead, inbound, last load, the days you reached out and the
              times they reached in. Its verdict is the suggestion’s direction —
              ▲ up, ▼ down, HOLD; under three loads in the window it is THIN, no
              verdict, never a fake grade; and a ▼ on a Tier 1 or 2 you reached
              out to on fewer than four days reads HOLD, “never fed — the
              verdict is on us”.
              <br />
              <br />
              <span className="text-light">MARK … REVIEWED</span> signs the
              month with one to three targets for the month ahead; the pill
              then reads REVIEWED with the date and your name, and the targets
              print under the head — with an EDIT link under them that reopens
              the sheet on what you wrote, so a signed period can be corrected
              without a second row. Dispatch sees the targets and “the owner
              signs the month”.
              Switch to <span className="text-light">QUARTER</span> for the four
              checks: TOP 3 SHARE of net against last quarter, STEADY AGENTS
              (two or more loads), MONTHS SIGNED (three of three, or which one
              is missing) and <span className="text-light">RISERS</span> — a
              parked agent, by you or by dormancy, who gave two or more loads
              this quarter wears a RISER chip: the book says promote, you decide
              from the sheet. Two lists follow: FED, STAYED QUIET — tiered
              agents you reached out to on four or more days who gave no load
              and no inbound, the prune candidates (you park from the sheet
              with a reason, never automatically) — and NEVER FED, the ones you
              barely touched, a to-do rather than a prune. GROWTH · MARKETS TO
              HUNT ranks the origin states by average gross per delivered load,
              with the load count beside each so one lucky haul is never
              mistaken for a market, and MARK … AUDITED saves one to five
              names to pursue as the quarter’s targets; while the quarter is
              still running the head says when its audit opens. The stepper
              walks back through finished months and quarters — ‹ and › — and
              the scorecard, the tier-move log and the quarter’s checks rest on
              the period you are standing on, while cooling, the milestones,
              the cap audit, hygiene and IS IT WORKING always read today. COPY
              REPORT puts the whole page on the clipboard as plain text.
            </Why>
          </Metric>

          <Section title="Agencies and posting codes">
            <p className="text-sm text-muted-text">
              A Landstar <span className="text-light">agency</span> is a
              business with its own 3-letter code — Central Pennsylvania
              Logistics Inc is <span className="text-light">CPL</span>. The
              agents inside it each post under their{" "}
              <span className="text-light">own</span> code: Eric Hesketh posts
              MAM, Drew Hannon posts CJY. The agency code is the shared desk —
              whoever posts from it, like Rich Stewart, wears CPL itself. That
              is why one agency used to look like three separate names in dash:
              three codes, one business. So a code on its own never tells you
              who you're talking to; the person does.
            </p>
            <p className="text-sm text-muted-text mt-3">
              dash draws the two apart. An agent's{" "}
              <span className="text-light">own code is dashed</span> and an{" "}
              <span className="text-light">agency code is lit</span> — so a
              glance at the book says whether you're looking at a person's code
              or the desk they share. Their posting code is optional: leave it
              blank and they wear the agency's.
            </p>
            <p className="text-sm text-muted-text mt-3">
              A <span className="text-light">load</span> carries a posting code
              too, and it is never typed. The settlement feed fills it from what
              the freight bill actually posted, so it is evidence: it either
              confirms the person you booked through or flags a mismatch the day
              the money lands. A load whose settlement lines disagree with each
              other stays blank for you to look at. The{" "}
              <span className="text-light">Agencies page</span> rolls the whole
              book up by agency — every code, every person, and what the agency
              has delivered; it is the next section.
            </p>
          </Section>

          <Section
            title="Agencies — the book by agency"
            sources={[{ label: "Agencies", to: "/agencies" }]}
          >
            <p className="text-sm text-muted-text">
              <span className="text-light">Agencies</span> is the same book from
              the desk's side: one row per agency, biggest first by gross. The
              row carries what that desk{" "}
              <span className="text-light">delivered</span> and what it grossed,
              its <span className="text-light">all-in RPM</span> with the rate
              ladder's word under it (above Strong, above Target, above Minimum,
              under Minimum, losing money), how many agents work there and how
              many of them you have tiered, and how long since its last load.
              Beside that RPM sits the desk's{" "}
              <span className="text-light">$/day</span> — the window's gross
              over the days its freight owned the truck, weighted and coloured
              against your own daily target from the rate ladder, per calendar
              day (see{" "}
              <span className="text-light">Lane rate — typical vs blended</span>
              ). Tap the row for the agency's own page.
            </p>
            <p className="text-sm text-muted-text mt-3">
              <span className="text-light">What it rolls up, and what it does
              not.</span> An agency's numbers come off the{" "}
              <span className="text-light">loads booked through it</span> — the
              agency is stamped on the load, so a person who moves to another
              desk leaves their history behind and the old agency keeps the
              revenue it earned. The people do not get rolled up: an agent's
              delivered count, all-in RPM and tier on this page are the same
              figures their own row shows on Relationships, over every load
              they have ever booked. That is deliberate — a tier is about a
              relationship with a <span className="text-light">person</span>,
              and Eric can be a Tier 1 inside an agency running under Minimum.
              So an agency's delivered count and the sum of its agents' counts
              can disagree; they answer two different questions.
            </p>
            <p className="text-sm text-muted-text mt-3">
              <span className="text-light">The chips are the paper trail.</span>{" "}
              The agency's own code is lit; every other code the desk has posted
              under is dashed — its agents' codes, and older desks nobody works
              any more. The agency page's{" "}
              <span className="text-light">CODE TRAIL</span> checks that set
              against what the settlements actually paid: "7 of 7 delivered
              loads post a code this agency owns. Nothing to reconcile." When
              one doesn't, the load is listed with the code it posted under — a
              load filed under the wrong agency, or a desk nobody has recorded
              yet. A load the settlements have not spoken for is neither; it
              waits.
            </p>
            <p className="text-sm text-muted-text mt-3">
              <span className="text-light">SETTLEMENT-ONLY</span>, folded under
              the list, is freight Landstar{" "}
              <span className="text-light">paid</span> that never became a load
              in dash: a trip line on a settlement with no load record, grouped
              by the code it posted under. A code you already know shows its
              agency and a door; a code dash has never seen shows the code
              itself and a <span className="text-light">+</span> that names the
              agency behind it. These rows carry no miles, no agent and no
              footprint, so they never enter the ladder, the tiers or the
              Foreman — they are history and a prompt to enter the load. The
              shelf shows the <span className="text-light">current year
              only</span>: dash started tracking in 2026, and settlements older
              than that are from before the books existed.
            </p>
            <p className="text-sm text-muted-text mt-3">
              <span className="text-light">The window</span> — 12 months, 90
              days or all time — moves the delivered count, the gross, the RPM
              and the loads list. It does not move the inbound share, which is
              always measured since the system started, and it never hides the
              last load: a desk quiet for six months still says when it last
              ran. Agencies with nothing delivered in the window fold below the
              ones that ran. <span className="text-light">COPY REPORT</span>{" "}
              puts the list as shown — search applied — on the clipboard as
              plain text. A{" "}
              <span className="text-light">+ Agency</span> button names a new
              desk — Dispatch can do that too; correcting one that already
              exists is the owner's EDIT on the agency page.
            </p>
          </Section>

          <Section title="Editing an agent">
            <p className="text-sm text-muted-text">
              <span className="text-light">EDIT INFO</span> on an agent's page
              turns the header and the Contact panel into fields — first and
              last name, agency, their posting code, city and state, phone,
              email and how they prefer to be reached (call, text or email) —
              and SAVE CHANGES writes them in place. Names are required;
              everything else can be left blank — including the agency: a
              prospect is a person first, and a codeless agent wears NO CODE
              until you learn it. A blank posting code means they post from the
              agency's own desk. A name
              that's already on your book is refused, since two agents can't
              share one. Changing the agency moves the{" "}
              <span className="text-light">person</span> to the new code — the
              loads already booked under them keep the agency they were booked
              through, so past revenue stays where it was earned. Dispatchers
              can do all of this too; only the star rating, the tier and the
              standing notes keep their own editors. Phone, email, preferred
              channel and best time to call also edit in place from the agent
              sheet on the Relationships page.
            </p>
          </Section>

          <Metric
            title="Inbound share — is the system working?"
            answers="The one number: what share of your booked loads came from agents reaching out to YOU."
            sources={[{ label: "Relationships", to: "/relationships" }]}
          >
            <Formula>
              inbound share = loads the agent brought you ÷ attributed loads
            </Formula>
            <Why>
              Every new load answers one required question at booking: did the
              agent reach out, or did you? The whole thesis of relationship
              work is that capacity heads-ups, milestone notes and being the
              easy, reliable truck compound until agents call{" "}
              <span className="text-light">you</span> first — so the fleet-wide
              share should climb from the system-start baseline (Sep ’26), and{" "}
              <span className="text-light">Tier 1’s share should pull away
              from Tier 3’s</span>. If it doesn’t within a quarter or two, the
              method isn’t landing — change the plays, not the goal. Loads
              from before the system carry no answer and sit outside the math.
              A load lands in the number on the{" "}
              <span className="text-light">day it was booked</span>, not the day
              it picks up: book it today for next week’s pickup and it counts
              today, and the month-by-month rows are booking months for the same
              reason. The INBOUND chip in the Relationships statusbar carries
              the number since system start — a plain fraction (“4 of 9”) until
              ten attributed loads exist, a percent after that, because a
              percentage of three loads is noise. Review’s IS IT WORKING plate
              carries the same number cut by each agent’s current tier and laid
              out month by month since system start; a chart only appears once
              three months each hold five attributed loads.
            </Why>
          </Metric>

          <Metric
            title="Prospects — from stranger to agent"
            answers="Agents you're courting — added by hand, or hauled once or twice — tracked to their third load."
            sources={[{ label: "Relationships", to: "/relationships/tiers" }]}
          >
            <Why>
              Add one with <span className="text-light">+ PROSPECT</span>,
              person first: a name and a phone or an email is enough. The
              agency code is optional — pick one, type a new one and it is
              created on the spot, or leave it blank and they wear NO CODE
              until you learn it; a code that already exists is matched, never
              duplicated. Where they sit, how you found them and a note round
              it out, and as you type the name dash says “Looks like Gary
              Robinson · SRY — open instead?” so nobody gets added twice. They
              land in <span className="text-light">Prospects</span> with no
              tier. Every stage after that is{" "}
              <span className="text-light">derived</span> — nothing to update
              by hand: the row’s chip reads NEVER RAN, then 1 OF 3 LOADS, 2 OF
              3, and at the third delivered load they graduate to NEEDS A TIER
              for the owner to place. A prospect who goes 180 days without a
              load or a two-way contact is treated as dormant and drops to
              Parked; a reached call or a load brings them straight back. Two
              touch types belong here — <span className="text-light">
              Prospecting</span> for an agent who never ran and{" "}
              <span className="text-light">Reactivation</span> for one who
              hauled before and went quiet — and each counts as the week’s one
              proactive touch. Today works them for you: the lapsed ones (a
              load once, nothing two-way in six weeks) lead Tuesday and
              Thursday as reactivation, the never-ran ones follow on Thursday
              as prospecting — three at a time, the rest behind the Call list
              door.
            </Why>
          </Metric>

          <Metric
            title="The call list — reactivation, prospects, the one question"
            answers="Two working lists — lapsed prospects who hauled, and prospects who never ran — and one call screen that captures the footprint, the outcome, the one question and the next step in the order that survives a bad signal."
            sources={[{ label: "Call list", to: "/relationships/calls" }]}
          >
            <Why>
              <span className="text-light">Two lists, one switch.</span>{" "}
              <span className="text-light">REACTIVATION</span> is the Gameplan’s
              target list: every Prospect who has hauled for you at least once
              and has gone quiet — no load and no two-way contact (a reached
              call, anything inbound, a pickup or a delivery) in 42 days. A
              tiered agent rides the nurture method instead, a Parked agent is
              on no list, and an agent you promised to call back stays off the
              list until that day comes (it shows up on Today). A voicemail
              does not reset the clock — it sinks the row to the end of its
              group and counts as an unreached attempt; three unreached calls
              in two weeks move the row to a{" "}
              <span className="text-light">RECYCLE — NEXT ROTATION</span> fold,
              because persistence is a channel problem, not a frequency one:
              find the number or the time they answer. They re-enter on their
              own after 42 quiet days.{" "}
              <span className="text-light">PROSPECTS</span> is everyone with no
              delivered load yet — the row’s chip reads NEW, TOUCHED ×2 or
              REPLIED, replied first, then whoever has waited longest — and the
              head counts how many converted (a first load inside 90 days). In
              season a third tab joins them,{" "}
              <span className="text-light">HOLIDAY · NOV 26</span> — the active
              book, Tier 1 first, minus everyone already wished this
              holiday-year — and a row there opens the note on the agent’s
              sheet to copy and send, not a call screen.
              <br />
              <br />
              <span className="text-light">Market grades are generated, not
              typed.</span> Every origin state with two or more delivered loads
              in the trailing twelve months is ranked by average gross revenue
              per delivered load: the top third is A, the middle third B, the
              rest — and any state with fewer than two loads — C. The caption
              under the controls spells it out (“A = GA, SC · B = TX, OH · C =
              everyone else …”), the Market switch filters to a grade, and the
              reactivation list runs A → B → C, warmest first inside each grade
              — 60% how many loads they’ve given you, 40% how recently. Every
              row: the class chip (DIRECT, SPOT, UNCLEAR, or NOT YET ASKED —
              from the pin or from repeat facilities, never a default), their
              top market and grade, loads and average, the footprint meter,
              and days quiet.
              <br />
              <br />
              <span className="text-light">The call screen.</span> Tap a row
              and it opens as a full-screen card on the phone (back chevron,
              “3 of 17”) or the right-hand pane on a desktop — its own address,
              so a refresh mid-call lands you back on the call. The header is
              who they are and how to reach them (the CALL button dials);
              beneath it, why they’re on the list, then the{" "}
              <span className="text-light">SCRIPT</span> — the reactivation or
              prospecting opener and voicemail from ADMIN-02, filled in from
              their record, open on your first call of the day and folded
              after. Then <span className="text-light">THE FOOTPRINT</span>:
              the six questions every call should capture, as a checklist with
              the answer captured inline — which shippers out of which cities
              (pick the city from the dropdown so the Foreman gets a real
              coordinate; a market they named is a dashed chip, one a load
              proved is solid, and the{" "}
              <span className="text-light">hauled from</span> line beside them
              follows each load’s customer mark — the origin normally, the
              destination when their own customer took delivery, and nothing at
              all from a load marked Neither); what moves most (the four freight chips,
              prefilled and clearable); their typical lane, anything regular,
              and what’s moving now — three one-liners that fold into the note
              as [lane] · [regular] · [season] so the next call can read them
              back; and the best number and time to call. The head counts
              “4 of 6”, and the{" "}
              <span className="text-light">FOOTPRINT CAPTURED</span> toggle
              lights itself once a market, a freight type and a best time are
              on file — flip it either way; it writes on the call.
              <br />
              <br />
              <span className="text-light">Outcome, the one question, next
              step.</span> Reached, voicemail, no answer or bad number — anything
              but Reached clears any class you picked, because nobody was
              spoken to. A bad number marks the row BAD # until a later call
              gets through, and question 6 offers the fix. When you reached an
              untiered agent whose class is blank or unclear, the one question
              appears —{" "}
              <span className="text-light">do they have their own customers?
              Direct, Spot, or Unclear</span>; Spot offers “park them now”. An
              agent already pinned shows the pin as a chip with a{" "}
              <span className="text-light">change</span> link, so a wrong pin
              has an exit. Next step is Nothing owed, Call back (Thu · +1 wk ·
              +2 wk · +1 mo · pick a date — Today shows it when it’s due), On
              their list, or Send capacity; the note is one line — what
              happened, what was promised, what’s owed, load # if any.
              <br />
              <br />
              <span className="text-light">Someone else answered?</span> Say so
              before you log. Type the name — the search covers every agent in
              the book by name, any agency code, because the person is the
              anchor — pick the match, or create them on the code you type (or
              none). Everything from the call files under them; the dialed
              record gets one breadcrumb note and nothing else, and you stay
              on that card to skip or park it. Reactivation and prospecting are
              proactive touches, so the one-a-week cap applies: an agent who
              already had a proactive touch this week sits dimmed in the list
              with a <span className="text-light">TOUCHED MON</span> chip, and
              the call screen wears the same chip in its header — you see the
              cap before you dial. A call that happens anyway is logged as it
              happened — reached, voicemail, no answer or bad number — with a
              reason in the note; a call is never folded into a message,
              because the outcome is the record.
              <br />
              <br />
              <span className="text-light">LOG & NEXT</span> writes in a fixed
              order — the contact first, then the breadcrumb if the call was
              diverted, and the agent’s record (class, freight, best time,
              phone, a park) last — so a dropped signal can never leave an
              agent classed with no record of the call; if a later step fails
              the error names it and a second tap retries only what’s left.
              Then the screen moves to the next row you haven’t handled — no
              counter to lose its place: skipped and logged rows are remembered
              for the day, dimmed in the list, and the next call is simply the
              first row that isn’t one of them. When none are left the list
              says so and points at Prospects.
            </Why>
          </Metric>

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
              the vendor's name here — or a spelling you've merged into it.
              Escorts, permits, and the rest just carry
              the rating for now — the spend score grows from the shops, where
              the data already lives.
            </Why>
          </Section>

          <Section
            title="One-offs and merged spellings"
            sources={[
              { label: "Vendors", to: "/vendors" },
              { label: "Maintenance", to: "/maintenance" },
            ]}
          >
            <p className="text-sm text-muted-text">
              Every vendor name on a maintenance service that the rolodex doesn't
              know yet shows up on the Vendors page under{" "}
              <span className="text-light">From your maintenance log</span>, with
              what you've spent there and when you were last in. Each one has
              three doors: <span className="text-light">Add</span> files it as a
              new vendor, <span className="text-light">Merge into</span> folds it
              into a vendor you already have, and{" "}
              <span className="text-light">One-off</span> says you're never going
              back. dash never taps a door for you — the lit one is only its
              lean.
            </p>
            <p className="text-sm text-muted-text mt-3">
              A <span className="text-light">one-off</span> is remembered, not
              erased. The name stays in your log exactly as you typed it; it just
              stops being offered. Every one you've set aside is listed under the{" "}
              <span className="text-light">DISMISSED · ONE-OFF STOPS</span> fold
              at the bottom of the board, and Undo puts it straight back on the
              list.
            </p>
            <p className="text-sm text-muted-text mt-3">
              A <span className="text-light">merge</span> does two things at
              once. The vendor keeps the log's spelling as an{" "}
              <span className="text-light">alias</span>, and the log rows written
              under that spelling are rewritten to the vendor's name. From then
              on the vendor's spend, the shop tab's BY VENDOR board and the
              truck's card all add up the same way, because there's only one
              spelling left to add up. The log sheet's vendor box helps you keep
              it that way: it autocompletes from the rolodex, and typing an alias
              turns it into the vendor's own name as you go.
            </p>
            <Why>
              Merged wrong? Open the vendor's page and drop the alias with the ×
              on the <span className="text-light">also "…"</span> chip. The alias
              goes and the vendor stops claiming that name — the log rows keep the
              name they were rewritten to, so if a couple of them really belonged
              somewhere else, retype those two.
            </Why>
          </Section>

          <div
            className="my-6 border-t"
            style={{ borderColor: "var(--color-hairline)" }}
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
              Your yearly cash plan, run on two beats. The rules are ADMIN-03 ·
              Owner distributions in the operations manual; dash hands out the
              orders and Excel keeps the log.{" "}
              <span className="text-light">Every Friday</span>: snapshot
              first — after the settlement and payroll land, punch in the raw
              balances — then the accrual: the pay week's mileage (Wednesday to
              Tuesday) by odometer — the reading at the week's end minus the
              reading at its start, from every fill, every load's pickup and
              delivery, and every trip log, so every mile the truck rolls
              counts — × the plan's $ per mile moves to Maintenance; the figure
              is pre-filled and editable, with the loads' own number shown
              beside it. A closed pay week accrues once, on the first snapshot
              after it closes — and closed weeks re-true: every week that has
              already accrued is re-read from the chain as it stands today, and
              the miles the chain found after the fact (a home trip logged a
              week late, a fill typed on Sunday) ride into the next accrual as
              a catch-up, once; the snapshot's stored miles stay the record of
              what moved, and the cash board books the same catch-up the same
              Friday. On the odometer chain unlogged deadhead is
              already inside the reading-to-reading delta, so it needs no flag;
              when no reading predates the week the miles fall back to the
              loads, and then a load with no deadhead logged is flagged, not
              counted as free miles. A reading that goes backwards — or one
              typed too high, an impossible week — is a typo: it's flagged, and
              the money waits until you fix the entry.{" "}
              <span className="text-light">The money day</span> opens once the
              month has closed and its P&amp;L is filed in Expenses — a P&amp;L
              posted mid-month waits for the calendar — and runs any day but
              the month's first Friday, which is the new month's Friday; dash
              refuses both, on the form and at the server. Tax
              comes off the top (the plan's % of the month's pre-tax profit —
              the P&amp;L you uploaded on Expenses, before depreciation, not the
              QuickBooks figure; a loss moves $0). Then the interlock: Ops must hold the float line
              before there is any surplus at all; the surplus then fills
              Maintenance to its floor ($5,000 as of Nov 2026 — set in EDIT PLAN,
              meant to grow with the business), then the Vault to the ladder's
              first rung, and only when every floor holds comes the split: the
              plan's objective % to the current rung, the rest to the
              household. Under the minimum movement
              nothing moves and the money rides into next month. Tick the month
              on the snapshot form and dash renders the SOP's seven-line entry,
              copy-ready for Excel, and keeps with the snapshot what the day
              moved — the tax, the surplus, the split — so a re-uploaded
              P&amp;L or a changed rate never rewrites a settled month (a money
              day run before Nov 4, 2026 kept only its month tag, and the page
              says so). The log is still Excel's. A snapshot is dated today or
              earlier; of two typed the same day, the later one is the latest.
              The verdict stamp names its basis — the Ops number it read and
              the moves it took off — so it never reads two ways.
            </p>
            <Formula>
              accrual = pay-week miles × $/mile · catch-up = chain miles over
              every accrued week − the miles the snapshots stored · tax =
              max(0, % × pre-tax
              profit) · surplus = max(0, ops − accrual − tax − float line) ·
              under the minimum → nothing moves · fill Maintenance to its
              floor, then the Vault to rung 1 · remainder × objective % → the
              objective, the rest → household
            </Formula>
            <Why>
              The floors are the interlock: a healthy Ops balance on a good
              Tuesday is not surplus until the month is closed, the tax is out
              and every reserve holds its floor — so the verdict reads BELOW
              FLOAT, FLOORS FIRST or ON PLAN. The ladder is still the plan —
              rung 1 is floor 3, the current objective is the first rung after
              it, debts die from the split (and from vault money above the
              ratchet, which still goes to the objective whole), the trade-up
              fund is vault money above the ratchet. Edit the rungs, the
              settings (per mile, tax %, the maintenance floor, the minimum
              movement, the split, the first money month) and the account roles
              — ops, vault, maintenance, tax, watched — in EDIT PLAN; write
              next year's plan fresh and the old year keeps its history. Marge
              reads the same tables for the Friday report.
            </Why>
          </Section>

          <Section title="Appearance — light and dark">
            <Metric
              title="Day Cab and Night Cab"
              answers="Why does dash look different on my phone than on the laptop?"
            >
              <Formula>
                System follows the device · Light and Dark hold · remembered on this device only
              </Formula>
              <Why>
                dash has two looks built from one set of colour names:{" "}
                <span className="text-light">Night Cab</span>, the dark cab with
                amber instruments, and <span className="text-light">Day Cab</span>,
                the same cab in daylight — cool paper, white panels, navy ink, amber
                kept for the instruments and deepened where it has to be read as
                words. On a device that has never chosen, dash follows the operating
                system's setting and changes with it. The toggle at the foot of the
                sidebar switches with one tap; Settings → Appearance offers System,
                Light and Dark. The choice is stored on the device, never on the
                account, so the phone can stay dark while the office laptop is light.
              </Why>
            </Metric>
          </Section>
          <Section title="What a dispatcher sees">
            <p className="text-sm text-muted-text">
              A dispatcher's menu is trimmed to the day-to-day: the Dispatch
              board, Score a Load, The Foreman, Loads, Trips, Lanes, Agents,
              Vendors, Facilities, the fleet (Trucks, Trailers, Drivers),
              Maintenance, Relationships, her own{" "}
              <span className="text-light">Recap</span>, Compliance, and this
              Guide. The money pages — Expenses, Plan, Cash Flow, Market,
              Per&nbsp;Diem, Fuel, and Settings —
              are kept off a dispatcher's menu and pages — a boundary the app
              keeps, not the server; dash is its own only client — so the
              P&amp;L stays out of her day-to-day. Her Recap covers
              the loads <span className="text-light">she</span> booked, in
              gross; net and profit appear nowhere on her side.
            </p>
          </Section>

          <Section title="The Dispatch board">
            <p className="text-sm text-muted-text">
              A dispatcher opens her board to <span className="text-light">act</span>,
              not to think, and she has one question that repeats on a horizon
              of hours: is the truck covered, and what do I do next? So the
              board answers in that order — <span className="text-light">Now</span>,{" "}
              <span className="text-light">Next</span>,{" "}
              <span className="text-light">Owed</span> — and it changes colour
              with the state. A covered week and an empty one should not look
              the same at a glance.
            </p>
            <p className="text-sm text-muted-text mt-3">
              <span className="text-light">Now</span> is the{" "}
              <span className="text-light">load console</span>, and it is the
              one part of the board you work rather than read. Each rolling load
              is a card with both stops on it. Tap{" "}
              <span className="text-light">Arrived</span> when you back in and{" "}
              <span className="text-light">Departed</span> when they turn you
              loose, and the stop's clock runs on the card from then on —
              counting live, in hours and minutes, with the claimable part
              called out separately in red the moment free time runs out. Tapping
              Arrived at the shipper also flips a booked load to{" "}
              <span className="text-light">in transit</span>, so you don't say
              it twice. Mis-tapped? <span className="text-light">Undo
              arrival</span> is right there.
            </p>
            <p className="text-sm text-muted-text mt-3">
              <span className="text-light">Mark delivered</span> finishes the
              load without opening it: it asks for the end odometer — the one
              moment that number is actually knowable — and shows the distance
              beside it as you type, so a fat-fingered digit reads as a wrong
              mileage before it is saved. A reading that would make the load
              impossibly long is refused outright. That end odometer becomes the{" "}
              <span className="text-light">next</span> load's start, so you never
              type it twice. Once it saves, the load leaves the console, the next
              one takes the floor, and{" "}
              <span className="text-light">Undo</span> sits in the band for half
              a minute in case it was the wrong load.
            </p>
            <p className="text-sm text-muted-text mt-3">
              Why it matters: the stop times were always four clicks away on the
              load page, and so they mostly didn't get logged —{" "}
              <span className="text-light">28 loads out of 139</span> had an
              in-time at the shipper. Everything downstream runs on those two
              stamps: detention, dwell by facility, the agent scorecard, the
              on-time read. A tap at the dock is also worth more than the same
              time typed in on Friday: detention found at the week's end is a
              claim, detention watched at hour two is a{" "}
              <span className="text-light">phone call</span>, while the truck is
              still on the dock and the agent can still do something about it.
              The taps store the full moment, not just a time of day, which is
              what lets a clock keep counting through midnight.
            </p>
            <p className="text-sm text-muted-text mt-3">
              <span className="text-light">Next</span> is the gap. It names the
              day and the town the truck comes free — the last load to deliver
              decides it, not the first — and turns{" "}
              <span className="text-light">red when nothing is booked behind
              it</span>, because an empty truck costs money every hour it
              lasts. From there it hands you straight to The Foreman and Score
              a Load, with the booking floor underneath: what a load has to
              beat, gross per mile.
            </p>
            <p className="text-sm text-muted-text mt-3">
              <span className="text-light">Owed</span> is the quiet one — the
              chase list. Detention to claim, pickups inside three days with no
              window set, rolling loads missing their in-time, and rows waiting
              on Integrity. None of it is as urgent as an empty truck, so it
              sits last and stays grey.
            </p>
            <p className="text-sm text-muted-text mt-3">
              Below the bands: the loads table, searchable and filterable, and
              the desk board — which agents actually pay. Detention is shown in{" "}
              <span className="text-light">hours</span>, not dollars, because
              the rate per hour isn't settled until it lands on the statement.
              Your own booking figures live on{" "}
              <span className="text-light">Recap</span>, by month, quarter or
              year — a worklist and a report card are different jobs, and
              before v1.270.0 they were competing on one screen.
            </p>
          </Section>

          <Section title="Agents and lanes are graded on gross">
            <p className="text-sm text-muted-text">
              Everywhere an <span className="text-light">agent</span> or a{" "}
              <span className="text-light">lane</span> is ranked on the
              dispatcher's side — the desk board and the agent
              pages — the number is <span className="text-light">gross</span> revenue
              (the full customer rate), not net. An agent who books a strong
              load did their job; they shouldn't be marked down because a
              deadhead leg or a cost of yours thinned the net. Net is your
              operational result and lives on the owner side; gross is what the
              agent and the lane actually delivered. The owner's leaderboard on
              the Agents tab grades desks by their all-in rate (see{" "}
              <a
                href="#the-agents-leaderboard-by-desk"
                className="text-status-info-text hover:underline"
              >
                The agents leaderboard — by desk
              </a>
              ).
            </p>
          </Section>

          <Section
            title="The dispatcher page"
            sources={[
              { label: "Dispatch board", to: "/dashboard" },
              { label: "Recap", to: "/my-recap" },
            ]}
          >
            <p className="text-sm text-muted-text">
              Every dispatcher has their own page, reached from her avatar chip
              on the dispatch board (or, for the owner, from Settings → Team).
              It is a plain page: the avatar and name, then her booking
              figures — <span className="text-light">loads booked</span>{" "}
              (lifetime and this month),{" "}
              <span className="text-light">gross booked</span>,{" "}
              <span className="text-light">booked over the floor</span> (her
              average booked rate, gross per driven mile, against your
              walk-away floor),{" "}
              <span className="text-light">detention collected</span>, and{" "}
              <span className="text-light">on-time</span>. Under them, a{" "}
              <span className="text-light">Season</span> card with Month,
              Quarter and Year tabs: loads booked, gross booked, average rate
              against the target rung, on-time, best load, and a strip of recent
              completed periods with their load counts.
            </p>
            <p className="text-sm text-muted-text mt-3">
              The page counts only the loads a person actually booked. Every
              load records a <span className="text-light">"Booked by"</span> —
              it defaults to whoever enters it, so a dispatcher's own loads
              credit to them automatically. As the owner you'll see a Booked-by
              picker on the load form to hand credit to a dispatcher for a load
              you entered, and you can open any teammate's page from{" "}
              <Link
                to="/settings"
                className="text-status-info-text hover:underline"
              >
                Settings → Team
              </Link>
              . Everything on the page is gross per driven mile, on the booking
              ladder — never net, never per loaded mile. A load whose driven
              miles are unknown (no odometer window, no known deadhead) is left
              out of the rate and counted beside it.
            </p>
            <p className="text-sm text-muted-text mt-3">
              Her <span className="text-light">Recap</span> page reads the same
              loads by period: pick Month, Quarter, or Year, and step to earlier
              periods with the arrows. It shows booked gross, loads, and average
              gross $/mile, then best load, on-time %, detention collected (in
              hours), and her best pay week, then top agent and top lane — all
              on the loads she booked, in gross. Older periods read empty on
              purpose: every load booked before dispatcher logins existed is
              credited to the owner.
            </p>
          </Section>
        </main>
      </div>
    </div>
  );
};

export default GuidePage;
