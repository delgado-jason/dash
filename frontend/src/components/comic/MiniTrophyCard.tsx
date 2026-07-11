import type { LucideIcon } from "lucide-react";
import { ComicBurst } from "@/components/comic/ComicBurst";

// A collectible award card for the trophy shelf. Gold trophies (mile clubs,
// strong seasons) get the gold foil edge; everything else the amber ink edge.
export const MiniTrophyCard = ({
  name,
  detail,
  Icon,
  gold = false,
}: {
  name: string;
  detail: string;
  Icon: LucideIcon;
  gold?: boolean;
}) => (
  <div
    className="w-[120px] shrink-0 rounded-[10px] overflow-hidden border-2"
    style={{ background: "#12161c", borderColor: gold ? "#f5b03a" : "#e8940a" }}
  >
    <div
      className="text-center font-comic uppercase py-[3px] px-1 truncate"
      style={{ background: "#0a0d13", color: "#f5b03a", fontSize: 10, letterSpacing: "2px" }}
    >
      {name}
    </div>
    <div className="flex flex-col items-center pt-2 pb-2 px-1">
      <ComicBurst size={40} fill={gold ? "#f5b03a" : "#e8940a"}>
        <Icon size={17} />
      </ComicBurst>
      <span className="text-[10px] text-center mt-1.5 leading-tight" style={{ color: "#c9b58f" }}>
        {detail}
      </span>
    </div>
  </div>
);
