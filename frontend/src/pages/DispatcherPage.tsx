import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLoads } from "@/hooks/useLoads";
import { useRateTargets } from "@/hooks/useRateTargets";
import { useGrind } from "@/hooks/useGrind";
import { getUser, type TeamMember } from "@/services/teamService";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import { getDispatcherCard, RANK_TIERS } from "@/lib/metrics/dispatcherCard";
import {
  dispatcherMedals,
  dispatcherPatches,
  type DispatcherAwardInput,
} from "@/lib/awards/dispatcherAwards";
import { DispatcherCard } from "@/components/playercard/DispatcherCard";
import { DispatcherPatchBoard } from "@/components/awards/DispatcherPatchBoard";
import { MedalBadge } from "@/components/awards/MedalBadge";
import { EntityAvatar } from "@/components/fleet/EntityAvatar";
import { Skeleton } from "@/components/ui/skeleton";

const LockedMedal = ({ name }: { name: string }) => (
  <div style={{ width: 46, textAlign: "center", opacity: 0.4 }}>
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        margin: "11px auto 0",
        background: "#141a26",
        border: "2px solid #2a3550",
      }}
    />
    <div style={{ fontSize: 8.5, color: "#7a869a", marginTop: 4, lineHeight: 1.1 }}>
      {name}
    </div>
  </div>
);

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
  };
  const medals = dispatcherMedals(awardInput);
  const patches = dispatcherPatches(awardInput);
  const earnedMedals = medals.filter((m) => m.tier > 0);

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

  const panel = "rounded-2xl border p-4 mt-4";
  const panelStyle = { background: "#141a26", borderColor: "#2a3347" };

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
          medals={earnedMedals}
        />

        {/* Career ladder */}
        <div className={panel} style={panelStyle}>
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

        {/* Medals — rare feats */}
        <div className={panel} style={panelStyle}>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="font-comic text-lg" style={{ color: "#f5b03a" }}>
              MEDALS
            </span>
            <span className="text-[11px] text-muted-text">
              rare feats · can't be ground out
            </span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {medals.map((m) =>
              m.tier > 0 ? (
                <MedalBadge key={m.key} medal={m} />
              ) : (
                <LockedMedal key={m.key} name={m.name} />
              ),
            )}
          </div>
        </div>

        {/* Patches — the grind */}
        <div className={panel} style={panelStyle}>
          <DispatcherPatchBoard patches={patches} />
        </div>
      </div>
    </div>
  );
};

export default DispatcherPage;
