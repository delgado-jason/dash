import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLoads } from "@/hooks/useLoads";
import { useRateTargets } from "@/hooks/useRateTargets";
import { getUser, type TeamMember } from "@/services/teamService";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import { getDispatcherCard, RANK_TIERS } from "@/lib/metrics/dispatcherCard";
import { DispatcherCard } from "@/components/playercard/DispatcherCard";
import { EntityAvatar } from "@/components/fleet/EntityAvatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel } from "@/components/ui/Panel";

const DispatcherPage = () => {
  const { id = "" } = useParams();
  const { loads, isLoading: loadsLoading, error } = useLoads(0);
  const targets = useRateTargets(loads);

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
      <div className="p-6 bg-iron text-light min-h-screen font-body">
        <p className="text-muted-text">Dispatcher not found.</p>
      </div>
    );

  if (loadsLoading || !member)
    return (
      <div className="p-6 bg-iron text-light min-h-screen font-body">
        <Skeleton className="h-4 w-24 mb-4" />
        <Skeleton className="h-80 max-w-md" style={{ borderRadius: 16 }} />
      </div>
    );

  if (error)
    return (
      <div className="p-6 bg-iron text-light min-h-screen">
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

  const avatar = (
    <EntityAvatar
      kind="user"
      id={id}
      avatarUrl={avatarUrl}
      size={80}
      allowVariant
      onUpdated={(u) => setAvatarUrl(u)}
    />
  );

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <Link to={backTo} className="text-xs text-muted-text hover:text-light">
        ← Back
      </Link>

      <div className="mt-3 max-w-md">
        <DispatcherCard
          name={name}
          business="Delgado Trucking Services · Dispatcher"
          avatar={avatar}
          card={card}
        />

        {/* Career ladder — progression through the ranks */}
        <Panel className="p-4 mt-4">
          <p className="text-xs uppercase tracking-wider text-muted-text mb-3">
            Career ladder
          </p>
          <div className="flex flex-col gap-2">
            {RANK_TIERS.map((tier, i) => {
              const reached = card.rank.count >= tier.min;
              const current = i === card.rank.index;
              return (
                <div key={tier.name} className="flex items-center gap-3">
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] shrink-0"
                    style={{
                      background: current
                        ? "#e8940a"
                        : reached
                          ? "#7a4718"
                          : "#232c3f",
                      color: current ? "#10151f" : reached ? "#f5b03a" : "#5f6b80",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span
                    className="flex-1 text-sm"
                    style={{
                      color: current ? "#f5b03a" : reached ? "#cdd8e8" : "#5f6b80",
                      fontWeight: current ? 600 : 400,
                    }}
                  >
                    {tier.name}
                  </span>
                  <span className="text-[11px] text-muted-text">
                    {tier.min}+ loads
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-text mt-3">
            {card.rank.next
              ? `${card.rank.toNext} more ${
                  card.rank.toNext === 1 ? "load" : "loads"
                } to reach ${card.rank.next.name}.`
              : "Top rank reached — legend status."}
          </p>
        </Panel>

        <p className="text-[11px] text-muted-text mt-4 text-center">
          Achievements &amp; goals coming soon.
        </p>
      </div>
    </div>
  );
};

export default DispatcherPage;
