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

// Achievement tiers land in 3b; the shells sit here so the page reads complete.
const COMING = [
  { icon: "🦅", label: "Rate Hawk" },
  { icon: "💰", label: "Detention Bounty" },
  { icon: "🤝", label: "Deal Closer" },
  { icon: "🔥", label: "Iron Booker" },
];

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
        <Skeleton className="h-56" style={{ borderRadius: 16 }} />
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
      size={118}
      allowVariant
      onUpdated={(u) => setAvatarUrl(u)}
    />
  );

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <Link to={backTo} className="text-xs text-muted-text hover:text-light">
        ← Back
      </Link>

      <div className="mt-3">
        <DispatcherCard
          name={name}
          business="Delgado Trucking Services · Dispatcher"
          avatar={avatar}
          card={card}
        />

        {/* Career ladder — horizontal progression */}
        <div
          className="rounded-2xl border p-4 mt-4"
          style={{ background: "#141a26", borderColor: "#2a3347" }}
        >
          <p className="text-[10px] uppercase tracking-widest text-muted-text mb-3">
            Career ladder
          </p>
          <div className="flex items-start gap-1.5">
            {RANK_TIERS.map((tier, i) => {
              const current = i === card.rank.index;
              const reached = card.rank.count >= tier.min;
              return (
                <div key={tier.name} className="flex-1 text-center min-w-0">
                  <div
                    className="rounded"
                    style={{
                      height: current ? 7 : 4,
                      background: current ? "#e8940a" : reached ? "#7a4718" : "#232c3f",
                    }}
                  />
                  <div
                    className="text-[10px] mt-1.5 truncate"
                    style={{
                      color: current ? "#f5b03a" : reached ? "#cdd8e8" : "#5f6b80",
                      fontWeight: current ? 600 : 400,
                    }}
                  >
                    {tier.name}
                  </div>
                  <div
                    className="text-[9px]"
                    style={{ color: current ? "#f5b03a" : "#5f6b80" }}
                  >
                    {tier.min}
                    {current ? " ◄ you" : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Achievements — 3b */}
        <div
          className="rounded-2xl border p-4 mt-4"
          style={{ background: "#141a26", borderColor: "#2a3347" }}
        >
          <p className="text-[10px] uppercase tracking-widest text-muted-text mb-3">
            Achievements <span className="text-[#5f6b80]">· coming soon</span>
          </p>
          <div className="flex gap-2 flex-wrap opacity-60">
            {COMING.map((a) => (
              <span
                key={a.label}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5"
                style={{ background: "#1a2033", border: "1px dashed #3a4a66" }}
              >
                <span>{a.icon}</span>
                <span className="text-[11px]" style={{ color: "#9daabb" }}>
                  {a.label}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DispatcherPage;
