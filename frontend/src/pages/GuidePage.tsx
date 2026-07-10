import { Trophy } from "lucide-react";
import { RatingMedallion } from "@/components/agents/RatingMedallion";
import { PrestigeBurst, PRESTIGE_META } from "@/components/agents/PrestigeBadge";
import type { PrestigeTier } from "@/lib/metrics/agentLeaderboard";

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
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="bg-plate rounded-lg p-5 mb-4">
    <h2 className="font-condensed text-xl mb-3">{title}</h2>
    {children}
  </section>
);

const GuidePage = () => (
  <div className="p-6 bg-iron text-light font-body min-h-screen">
    <div className="max-w-3xl">
      <h1 className="text-3xl font-condensed mb-1">Guide</h1>
      <p className="text-muted-text text-sm mb-6">
        How agents get rated, ranked, and awarded.
      </p>

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
          Ratings are your opinion; this is the scoreboard. Every calendar
          quarter, your agents are ranked by the revenue on the loads they
          actually delivered. Two things fall out of it — trophies, and a career
          rank — and both stick with the agent for good.
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
              style={{ color: "#f5b03a" }}
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
          corner of the agent's card. It never clutters and only ever levels up.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {TIERS.map(([tier, desc]) => (
            <div key={tier} className="flex items-center gap-3">
              <PrestigeBurst tier={tier} size={54} />
              <div>
                <p
                  className="font-condensed text-lg"
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
