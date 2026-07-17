import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { getUser, type TeamMember } from "@/services/teamService";
import { AvatarFallback } from "@/components/fleet/AvatarFallback";

// The logged-in dispatcher's avatar + name under the board title — taps through
// to their full page. Just identity here; the stats live on the page.
export const DispatcherChip = () => {
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
  const name = me?.display_name || "Dispatcher";

  return (
    <Link
      to={`/dispatcher/${selfId}`}
      className="inline-flex items-center gap-2 rounded-full pl-1 pr-2.5 py-1 hover:opacity-90"
      style={{ background: "#161d2b", border: "1px solid #2a3347" }}
      title="Your dispatcher page"
    >
      {me?.avatar_url ? (
        <img
          src={me.avatar_url}
          alt={name}
          className="w-[30px] h-[30px] rounded-full object-cover border-2"
          style={{ borderColor: "#e8940a" }}
        />
      ) : (
        <span
          className="w-[30px] h-[30px] rounded-full overflow-hidden border-2 block"
          style={{ borderColor: "#e8940a" }}
        >
          <AvatarFallback kind="user" />
        </span>
      )}
      <span className="text-sm text-light font-semibold">{name}</span>
      <ChevronRight size={13} className="text-muted-text" />
    </Link>
  );
};
