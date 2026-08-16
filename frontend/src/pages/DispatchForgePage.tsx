import { useEffect, useMemo, useState } from "react";
import { useLoads } from "@/hooks/useLoads";
import { useRateTargets } from "@/hooks/useRateTargets";
import { usePersonalGrind } from "@/hooks/useGrind";
import { useDispatcherAwardPops } from "@/hooks/useDispatcherAwardPops";
import { getUser, type TeamMember } from "@/services/teamService";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import { getDispatcherCard } from "@/lib/metrics/dispatcherCard";
import {
  dispatcherMedals,
  dispatcherPatches,
  type DispatcherAwardInput,
  type GrindPatch,
} from "@/lib/awards/dispatcherAwards";
import { currentSeason, type SeasonTrophy } from "@/lib/metrics/dispatcherSeason";
import { howToEarn } from "@/lib/awards/dispatcherHowTo";
import type { Medal } from "@/lib/awards/medals";
import { AwardPopHost } from "@/components/celebrations/AwardPopHost";
import { EntityAvatar } from "@/components/fleet/EntityAvatar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

// The forge is a playful surface — emoji read faster than lucide here, and match
// the medal/patch icon vocabulary the award engines already assign.
const EMOJI: Record<string, string> = {
  crown: "👑", coins: "🪙", package: "📦", mountain: "⛰️", medal: "🥇",
  trophy: "🏆", "stack-2": "📚", cash: "💰", feather: "🪶", flame: "🔥",
  users: "🤝", gauge: "⏱️", "arrows-horizontal": "🔁", truck: "🚛",
  route: "🛣️", road: "🛣️",
};
const emoji = (icon: string) => EMOJI[icon] ?? "🎖️";

const TIER_RING = ["#33415a", "#b08d57", "#c9d3e0", "#f5b03a"]; // none/bronze/silver/gold
const Bar = ({ pct, tone = "#f5b03a" }: { pct: number; tone?: string }) => (
  <div className="h-[7px] rounded-[6px] mt-2 overflow-hidden" style={{ background: "#090d15", border: "1px solid #1a2436" }}>
    <i className="block h-full rounded-[6px]" style={{ width: `${Math.round(Math.min(1, Math.max(0, pct)) * 100)}%`, background: `linear-gradient(90deg,#e8940a,${tone})` }} />
  </div>
);

const RackHead = ({ title, right }: { title: string; right?: string }) => (
  <div className="flex items-baseline gap-3 mt-8 mb-3">
    <h2 className="font-forge font-bold text-[15px] tracking-[2.5px] text-amber-hi whitespace-nowrap">{title}</h2>
    <span className="flex-1 h-px" style={{ background: "linear-gradient(90deg,rgba(34,48,74,.9),transparent)" }} />
    {right && <span className="text-[11px] tracking-[1.5px] uppercase text-faint">{right}</span>}
  </div>
);

const NextCard = ({ icon, name, gap, sub, pct }: { icon: string; name: string; gap: string; sub?: string; pct: number }) => (
  <div className="relative rounded-[12px] p-[13px_14px] overflow-hidden" style={{ background: "linear-gradient(180deg,rgba(20,27,40,.8),#090d15)", border: "1px solid #22304a" }}>
    <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-amber" />
    <div className="text-[19px]">{icon}</div>
    <div className="text-[14.5px] font-bold text-cream mt-[3px]" style={{ color: "#f5e6c8" }}>{name}</div>
    <div className="text-[12px] font-semibold text-amber-hi">{gap}</div>
    {sub && <div className="text-[11px] text-faint mt-[2px]">{sub}</div>}
    <Bar pct={pct} />
  </div>
);

const Coin = ({ m }: { m: Medal }) => {
  const on = m.tier > 0;
  return (
    <div className="text-center rounded-[11px] p-[12px_10px_10px]" style={{ background: "#090d15", border: "1px solid #22304a" }}>
      <div
        className="w-[70px] h-[70px] rounded-full mx-auto mb-[7px] flex items-center justify-center text-[26px] relative"
        style={{
          background: "radial-gradient(circle at 38% 30%,#20293a,#0c1017)",
          border: `${on ? 3 : 2}px ${on ? "solid" : "dashed"} ${TIER_RING[on ? Math.min(3, m.tier) : 0]}`,
          filter: on ? undefined : "grayscale(1) brightness(.5)",
          boxShadow: on ? `0 0 18px ${TIER_RING[Math.min(3, m.tier)]}66` : undefined,
        }}
      >
        {emoji(m.icon)}
        {!on && <span className="absolute -bottom-1 -right-1 text-[13px] opacity-70">🔒</span>}
      </div>
      <div className={`text-[12px] font-semibold ${on ? "text-ink" : "text-faint"}`}>{m.name}</div>
      <div className="text-[10px] uppercase tracking-[.5px]" style={{ color: on ? TIER_RING[Math.min(3, m.tier)] : "#5a6880" }}>
        {on ? `Tier ${m.tierLabel} · ${m.hint.split(" · ")[0]}` : m.hint}
      </div>
      <div className="text-[10px] leading-[1.35] text-faint mt-1 pt-1" style={{ borderTop: "1px dashed #223049" }}>
        {howToEarn(m.key)}
      </div>
    </div>
  );
};

const Tag = ({ p }: { p: GrindPatch }) => (
  <div className={`rounded-[10px] p-[10px_12px] ${p.earned ? "" : "opacity-60"}`} style={{ background: "#090d15", border: "1px solid #22304a" }}>
    <div className="grid grid-cols-[auto_1fr] gap-[11px] items-center">
      <div className="w-[34px] h-[34px] rounded-[8px] flex items-center justify-center text-[17px]" style={{ background: p.earned ? "rgba(232,148,10,.10)" : "rgba(90,104,123,.1)", border: `1px solid ${p.earned ? "rgba(232,148,10,.3)" : "#2b384f"}` }}>
        {emoji(p.icon)}
      </div>
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold" style={{ color: "#f5e6c8" }}>{p.name}</div>
        <div className={`text-[11.5px] font-semibold ${p.earned ? "text-amber-hi" : "text-faint"}`}>{p.badge} · {p.hint}</div>
      </div>
    </div>
    <Bar pct={p.progress} />
    <div className="text-[10.5px] text-faint mt-[3px]">{howToEarn(p.key)}</div>
  </div>
);

const Crown = ({ t, period }: { t: SeasonTrophy; period: string }) => (
  <div className={`rounded-[13px] p-[15px] text-center ${t.earned ? "" : ""}`} style={{ background: "linear-gradient(180deg,rgba(20,27,40,.8),#090d15)", border: `1px solid ${t.earned ? "rgba(245,176,58,.5)" : "#22304a"}`, boxShadow: t.earned ? "0 0 22px rgba(232,148,10,.16) inset" : undefined }}>
    <div className="text-[32px]" style={{ filter: t.earned ? undefined : "grayscale(1) brightness(.55)" }}>👑</div>
    <div className="text-[14.5px] font-bold mt-[5px]" style={{ color: "#f5e6c8" }}>{t.name}</div>
    <div className={`text-[11.5px] mt-[2px] ${t.earned ? "text-amber-hi" : "text-dim"}`}>{t.detail}</div>
    <div className="text-[10.5px] text-faint mt-[6px] pt-[6px]" style={{ borderTop: "1px dashed #223049" }}>
      {howToEarn(t.key)} · {period}
    </div>
  </div>
);

const DispatchForgePage = () => {
  const { loads, isLoading, error } = useLoads(0);
  const targets = useRateTargets(loads);
  const now = useMemo(() => new Date(), []);

  const selfId = localStorage.getItem("user_id") ?? "";
  const mine = useMemo(
    () => (selfId ? loads.filter((l) => l.booked_by === selfId) : []),
    [loads, selfId],
  );
  // Iron Booker rides her personal-pace booking streak (graded against her own
  // typical week), matching the dispatch board.
  const grind = usePersonalGrind(mine);

  const [member, setMember] = useState<TeamMember | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [freeHours, setFreeHours] = useState(3);

  useEffect(() => {
    if (!selfId) return;
    getUser(selfId)
      .then((u) => {
        setMember(u);
        setAvatarUrl(u.avatar_url);
      })
      .catch(() => {});
    getSettlementSchedule()
      .then((s) => setFreeHours(s.detention_free_hours))
      .catch(() => {});
  }, [selfId]);

  const awardInput: DispatcherAwardInput | null =
    selfId && targets.bookingLadder.walkAway != null
      ? {
          loads,
          userId: selfId,
          ladder: targets.bookingLadder,
          scoreBasis: {
            costPerDrivenMile: targets.basis.costPerTotalMile,
            payTake: targets.basis.payTake,
          },
          freeHours,
          streak: grind?.bestStreak ?? 0,
          tiers: targets.tiers,
          specTiers: targets.specTiers,
        }
      : null;
  const pops = useDispatcherAwardPops(awardInput);

  if (isLoading)
    return (
      <div className="p-6 text-ink font-body min-h-screen">
        <Skeleton className="h-40" style={{ borderRadius: 16 }} />
        <Skeleton className="h-56 mt-6" style={{ borderRadius: 16 }} />
      </div>
    );
  if (error)
    return (
      <div className="p-6 text-ink min-h-screen">
        <p className="text-destructive">{error}</p>
      </div>
    );

  const input: DispatcherAwardInput = awardInput ?? {
    loads,
    userId: selfId,
    ladder: targets.bookingLadder,
    scoreBasis: { costPerDrivenMile: targets.basis.costPerTotalMile, payTake: targets.basis.payTake },
    freeHours,
    streak: grind?.bestStreak ?? 0,
    tiers: targets.tiers,
    specTiers: targets.specTiers,
  };

  const card = getDispatcherCard(loads, selfId, targets.bookingLadder, freeHours, now);
  const medals = dispatcherMedals(input);
  const patches = dispatcherPatches(input);
  const season = currentSeason(loads, selfId, "quarter", targets.bookingLadder, freeHours, now);
  const name = member ? member.display_name || member.email : "Dispatcher";

  const earnedMedals = medals.filter((m) => m.tier > 0).length;
  const earnedPatches = patches.filter((p) => p.reached > 0).length;
  const crowns = season.trophies.filter((t) => t.earned).length;

  // NEXT UP — the closest not-yet-maxed achievements, most-progressed first, so
  // there's always a concrete next thing to chase.
  type Cand = { icon: string; name: string; gap: string; sub?: string; pct: number };
  const cands: Cand[] = [];
  if (card.rank.next)
    cands.push({
      icon: "🎖️",
      name: card.rank.next.name,
      gap: `${Math.max(0, card.rank.next.min - card.rank.count)} loads to the next rank`,
      sub: `${card.rank.count} of ${card.rank.next.min} booked`,
      pct: card.rank.pct,
    });
  for (const m of medals)
    if (m.next != null)
      cands.push({ icon: emoji(m.icon), name: `${m.name} · Tier ${m.tier + 1}`, gap: howToEarn(m.key), sub: m.hint, pct: m.progress });
  for (const p of patches)
    if (p.progress < 1)
      cands.push({ icon: emoji(p.icon), name: `${p.name} · ${p.hint.replace(/^next: /, "")}`, gap: howToEarn(p.key), sub: `at ${p.badge}`, pct: p.progress });
  const nextUp = cands.sort((a, b) => b.pct - a.pct).slice(0, 4);

  return (
    <div
      className="min-h-screen text-ink font-body"
      style={{ background: "radial-gradient(1200px 500px at 50% -6%, rgba(232,148,10,.10), transparent 60%)" }}
    >
      <AwardPopHost pops={pops} />
      <div className="max-w-[960px] mx-auto px-4 sm:px-6 pb-12">
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <span className="font-condensed font-medium text-[13px] tracking-[.14em] text-faint uppercase">
            Delgado Trucking · Dispatch Floor
          </span>
        </div>

        {/* HERO */}
        <div
          className="grid grid-cols-[auto_1fr] gap-[22px] items-center rounded-[16px] p-[20px_22px]"
          style={{ border: "1px solid #22304a", background: "linear-gradient(180deg, rgba(18,24,36,.7), rgba(10,13,19,.5))" }}
        >
          <div className="shrink-0">
            {/* key remounts the avatar when the URL arrives — EntityAvatar seeds
                its image state once and ignores later prop changes. */}
            <EntityAvatar key={avatarUrl ?? "none"} kind="user" id={selfId} avatarUrl={avatarUrl} size={96} allowVariant onUpdated={setAvatarUrl} />
          </div>
          <div className="min-w-0">
            <h1
              className="font-forge font-extrabold leading-[.86] mb-[10px]"
              style={{ fontSize: "clamp(34px,6vw,58px)", color: "#f5b03a", textShadow: "3px 4px 0 #0a0d13, 0 0 30px rgba(232,148,10,.45)" }}
            >
              THE DISPATCH FORGE
            </h1>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-2 text-[15px] font-bold rounded-full px-[14px] py-[5px]" style={{ color: "#f5e6c8", background: "rgba(232,148,10,.12)", border: "1px solid rgba(232,148,10,.4)" }}>
                <span className="text-gold" style={{ color: "#f5b03a" }}>★</span> {card.rank.name}
              </span>
              <span className="text-[12px] text-dim">
                <b className="text-amber-hi">{earnedMedals}</b> medals · <b className="text-amber-hi">{earnedPatches}</b> patches · <b className="text-amber-hi">{crowns}</b> season {crowns === 1 ? "crown" : "crowns"}
              </span>
            </div>
            {card.rank.next && (
              <div className="mt-[11px] max-w-[420px]">
                <div className="flex justify-between text-[11.5px] text-faint mb-[5px]">
                  <span>{card.rank.count} loads booked · {name}</span>
                  <span><b className="text-cream" style={{ color: "#f5e6c8" }}>{Math.max(0, card.rank.next.min - card.rank.count)}</b> to {card.rank.next.name}</span>
                </div>
                <Bar pct={card.rank.pct} />
              </div>
            )}
          </div>
        </div>

        {/* NEXT UP */}
        {nextUp.length > 0 && (
          <>
            <RackHead title="NEXT UP — WITHIN REACH" right="chase these" />
            <div className="grid gap-[11px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))" }}>
              {nextUp.map((c, i) => (
                <NextCard key={i} {...c} />
              ))}
            </div>
          </>
        )}

        {/* COINS */}
        <RackHead title="COINS — STRUCK AT THE PRESS" right="Bronze → Silver → Gold" />
        <div className="grid gap-[14px_12px]" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(148px,1fr))" }}>
          {medals.map((m) => (
            <Coin key={m.key} m={m} />
          ))}
        </div>

        {/* TAGS */}
        <RackHead title="TAGS — PUNCHED EVERY RE-EARN" />
        <div className="grid gap-[10px]" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
          {patches.map((p) => (
            <Tag key={p.key} p={p} />
          ))}
        </div>

        {/* SEASON CROWNS */}
        <RackHead title="SEASON CROWNS — THIS QUARTER" right={season.label} />
        <div className="grid gap-[12px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))" }}>
          {season.trophies.map((t) => (
            <Crown key={t.key} t={t} period={season.label} />
          ))}
        </div>

        <p className="text-[11.5px] text-faint mt-8 text-center max-w-[70ch] mx-auto">
          Your room, your numbers — everything counts only the loads <b>you</b> booked. Every achievement shows how to
          earn it; booking a steal, running a clean week, or extending your streak fires a celebration right here.
        </p>
      </div>
    </div>
  );
};

export default DispatchForgePage;
