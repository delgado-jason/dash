import { Link } from "react-router-dom";
import { missingWords, type MissingInput as Missing } from "@/lib/integrity/require";

// The refusal line a figure prints when a planning input it needs isn't set
// (Nod Sheet "The Protection Stage", mock 3; Jason's call 5: the line that needs
// the input carries the words, the rest of the column keeps its numbers, the
// ending waits). Reads: "Can't place this line — weekly payroll isn't set.
// Set it in ASSUMPTIONS ›". The fix is a route (Link) when the input lives on
// another page, or a callback when it opens a panel on this one.
interface Props {
  what: string; // "place this line" · "project the deposit" · "run the money day"
  missing: Missing[];
  onFix?: () => void;
  className?: string;
}

export const MissingInputLine = ({ what, missing, onFix, className = "" }: Props) => {
  if (missing.length === 0) return null;
  const first = missing[0];
  const fix = "Set " + (missing.length > 1 ? "them" : "it") + " in " + first.fixAt + " ›";
  const linkClass = "text-amber-hi hover:text-hot underline-offset-2 hover:underline";
  return (
    <span className={"font-condensed text-[13px] text-amber-hi " + className}>
      Can't {what} — {missingWords(missing)}.{" "}
      {first.fixTo ? (
        <Link to={first.fixTo} className={linkClass}>
          {fix}
        </Link>
      ) : onFix ? (
        <button type="button" className={linkClass} onClick={onFix}>
          {fix}
        </button>
      ) : (
        <span>{fix}</span>
      )}
    </span>
  );
};
