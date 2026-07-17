import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Load } from "@/types/load";
import type { RateLadder } from "@/lib/metrics/rateTargets";
import { getUser, type TeamMember } from "@/services/teamService";
import { getDispatcherCard } from "@/lib/metrics/dispatcherCard";
import { DispatcherCard } from "@/components/playercard/DispatcherCard";
import { AvatarFallback } from "@/components/fleet/AvatarFallback";

// The logged-in dispatcher's own card at the top of her board. Static avatar
// (editing lives on her page); the whole card links there.
export const MyDispatcherCard = ({
  loads,
  ladder,
  freeHours,
}: {
  loads: Load[];
  ladder: RateLadder;
  freeHours: number;
}) => {
  const selfId = localStorage.getItem("user_id") ?? "";
  const [me, setMe] = useState<TeamMember | null>(null);

  useEffect(() => {
    let active = true;
    if (selfId)
      getUser(selfId)
        .then((u) => active && setMe(u))
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [selfId]);

  if (!selfId) return null;

  const card = getDispatcherCard(loads, selfId, ladder, freeHours, new Date());
  const name = me?.display_name || "Dispatcher";
  const avatar = me?.avatar_url ? (
    <img
      src={me.avatar_url}
      alt={name}
      className="w-20 h-20 rounded-full object-cover border-2"
      style={{ borderColor: "#e8940a" }}
    />
  ) : (
    <div
      className="w-20 h-20 rounded-full overflow-hidden border-2"
      style={{ borderColor: "#e8940a" }}
    >
      <AvatarFallback kind="user" />
    </div>
  );

  return (
    <Link
      to={`/dispatcher/${selfId}`}
      className="block max-w-md hover:opacity-95"
      title="Your dispatcher card"
    >
      <DispatcherCard
        name={name}
        business="Delgado Trucking Services · Dispatcher"
        avatar={avatar}
        card={card}
      />
    </Link>
  );
};
