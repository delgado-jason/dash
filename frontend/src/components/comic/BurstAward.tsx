import type { LucideIcon } from "lucide-react";
import type { Award } from "@/lib/metrics/awards";
import { ComicBurst } from "@/components/comic/ComicBurst";

// A frequent re-earnable win — the comic burst presses in as a corner toast and
// fades. Click to dismiss early.
export const BurstAward = ({
  award,
  Icon,
  onDismiss,
}: {
  award: Award;
  Icon: LucideIcon;
  onDismiss: () => void;
}) => (
  <button
    onClick={onDismiss}
    className="flex items-center gap-3 rounded-[13px] border pl-2.5 pr-4 py-2.5 text-left w-[300px] max-w-[86vw]"
    style={{ background: "#10151f", borderColor: "#2a3347", animation: "award-toast-in .4s ease both" }}
  >
    <span style={{ animation: "award-press .5s cubic-bezier(.2,.8,.3,1.3) both" }}>
      <ComicBurst size={44} fill="#e8940a">
        <Icon size={19} />
      </ComicBurst>
    </span>
    <span className="min-w-0">
      <span
        className="block font-comic text-base"
        style={{ color: "#f5b03a", letterSpacing: "1px" }}
      >
        {award.name}
      </span>
      <span className="block text-xs text-muted-text truncate">{award.detail}</span>
    </span>
  </button>
);
