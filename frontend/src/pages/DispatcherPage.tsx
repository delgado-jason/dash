import { DEFAULT_DETENTION_FREE_HOURS } from "@/lib/detention";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLoads } from "@/hooks/useLoads";
import { useRateTargets } from "@/hooks/useRateTargets";
import { getUser, type TeamMember } from "@/services/teamService";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import { getDispatcherCard } from "@/lib/metrics/dispatcherCard";
import { DispatcherKpis } from "@/components/dispatch/DispatcherKpis";
import { DispatcherSeasonCard } from "@/components/dispatch/DispatcherSeasonCard";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { EntityAvatar } from "@/components/fleet/EntityAvatar";
import { Skeleton } from "@/components/ui/skeleton";

// A dispatcher's own page — reached from her avatar chip on the board, or from
// Settings → Team for the owner. Plain since the Redesign's phase B1: the rank
// ladder, the medals, the patches, the hardware board and the period trophies
// were the game's. What stays is what she booked: the figures and the season.
const DispatcherPage = () => {
  const { id = "" } = useParams();
  const { loads, isLoading: loadsLoading, error } = useLoads(0);
  const targets = useRateTargets(loads);

  const [member, setMember] = useState<TeamMember | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [freeHours, setFreeHours] = useState(DEFAULT_DETENTION_FREE_HOURS);
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
          <div className="shrink-0">
            <EntityAvatar
              kind="user"
              id={id}
              avatarUrl={avatarUrl}
              size={64}
              allowVariant
              onUpdated={(u) => setAvatarUrl(u)}
            />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-[34px] tracking-[.04em] leading-none">
              {name.toUpperCase()}
            </h2>
            <p className="font-condensed font-medium text-[12px] tracking-[.1em] uppercase text-faint mt-2">
              Dispatch · the loads booked under this name, in gross
            </p>
          </div>
        </div>

        <div className="mt-4">
          <DispatcherKpis card={card} full title="Bookings" />
        </div>

        {/* the season — her booked loads by month, quarter or year */}
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
