import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLoads } from "@/hooks/useLoads";
import { useRateTargets } from "@/hooks/useRateTargets";
import { useGrind } from "@/hooks/useGrind";
import { getUser, type TeamMember } from "@/services/teamService";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import { getDispatcherCard } from "@/lib/metrics/dispatcherCard";
import {
  dispatcherMedals,
  dispatcherPatches,
  type DispatcherAwardInput,
} from "@/lib/awards/dispatcherAwards";
import { DispatcherCard } from "@/components/playercard/DispatcherCard";
import { DispatcherSeasonCard } from "@/components/dispatch/DispatcherSeasonCard";
import { MedalBadge } from "@/components/awards/MedalBadge";
import { HardwareBoard } from "@/components/awards/HardwareBoard";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { EntityAvatar } from "@/components/fleet/EntityAvatar";
import { Skeleton } from "@/components/ui/skeleton";

const DispatcherPage = () => {
  const { id = "" } = useParams();
  const { loads, isLoading: loadsLoading, error } = useLoads(0);
  const targets = useRateTargets(loads);
  const grind = useGrind(loads);

  const [member, setMember] = useState<TeamMember | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [freeHours, setFreeHours] = useState(3);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    getUser(id)
      .then((u) => {
        if (!active) return;
        setMember(u);
        setAvatarUrl(u.avatar_url);
      })
      .catch(() => active && setNotFound(true));
    getSettlementSchedule()
      .then((s) => active && setFreeHours(s.detention_free_hours))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id]);

  const isAdmin = localStorage.getItem("role") === "admin";
  const backTo = isAdmin ? "/settings" : "/dashboard";

  if (notFound)
    return (
      <div className="p-6 text-ink font-body min-h-screen">
        <p className="text-faint font-condensed text-[14px]">Dispatcher not found.</p>
      </div>
    );

  if (loadsLoading || !member)
    return (
      <div className="p-6 text-ink font-body min-h-screen">
        <Skeleton className="h-4 w-24 mb-4" />
        <Skeleton className="h-56" style={{ borderRadius: 16 }} />
      </div>
    );

  if (error)
    return (
      <div className="p-6 text-ink font-body min-h-screen">
        <p className="text-destructive">{error}</p>
      </div>
    );

  const card = getDispatcherCard(
    loads,
    id,
    targets.bookingLadder,
    freeHours,
    new Date(),
  );
  const name = member.display_name || member.email;

  const awardInput: DispatcherAwardInput = {
    loads,
    userId: id,
    ladder: targets.bookingLadder,
    scoreBasis: {
      costPerDrivenMile: targets.basis.costPerTotalMile,
      payTake: targets.basis.payTake,
    },
    freeHours,
    streak: grind?.bestStreak ?? 0,
    tiers: targets.tiers,
    specTiers: targets.specTiers,
  };
  const medals = dispatcherMedals(awardInput);
  const patches = dispatcherPatches(awardInput);
  const earnedMedals = medals.filter((m) => m.tier > 0);

  const avatar = (
    <EntityAvatar
      kind="user"
      id={id}
      avatarUrl={avatarUrl}
      size={64}
      allowVariant
      onUpdated={(u) => setAvatarUrl(u)}
    />
  );

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">DISPATCHER</h1>
          <Link
            to={backTo}
            className="font-condensed font-medium text-[15px] text-faint hover:text-ink"
          >
            ← back
          </Link>
        </div>

        <div className="flex items-center gap-4 flex-wrap mt-[18px]">
          <div className="shrink-0">{avatar}</div>
          <div className="min-w-0">
            <h2 className="font-display text-[34px] tracking-[.04em] leading-none">
              {name.toUpperCase()}
            </h2>
            <div className="flex gap-2 mt-2 flex-wrap">
              <span className="font-condensed font-bold text-[10.5px] tracking-[.12em] px-[7px] py-[2px] rounded-[4px] text-amber-hi border border-[rgba(232,148,10,.4)] bg-[rgba(232,148,10,.07)]">
                {card.rank.name.toUpperCase()}
              </span>
              <span className="font-condensed font-medium text-[10.5px] tracking-[.1em] px-[7px] py-[2px] rounded-[4px] text-faint border border-hairline">
                DELGADO TRUCKING SERVICES · DISPATCH
              </span>
            </div>
          </div>
          {earnedMedals.length > 0 && (
            <span className="ml-auto flex gap-1.5 flex-wrap justify-end">
              {earnedMedals.map((m) => (
                <MedalBadge key={m.key} medal={m} />
              ))}
            </span>
          )}
        </div>

        <div className="mt-4">
          <DispatcherCard card={card} />
        </div>

        {/* the hardware — coins mostly ghost today, the whole career visible */}
        <HardwareBoard medals={medals} grindTags={patches} />

        {/* season — her 90-day booking grade */}
        <div className="mt-4">
          <DispatcherSeasonCard
            loads={loads}
            userId={id}
            ladder={targets.bookingLadder}
            freeHours={freeHours}
          />
        </div>
      </div>
    </div>
  );
};

export default DispatcherPage;
