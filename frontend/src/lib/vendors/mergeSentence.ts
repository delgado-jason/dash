import { moneyCents } from "@/lib/format";
import type { UnfiledShop } from "@/types/unfiledShop";

// The DATE arrives as an ISO string; slice to the calendar day and format at
// UTC midnight, or a row logged on the 1st reads as the 31st (CLAUDE.md §5).
// "Aug 28" — the bridge board's day, with the year left off: every one of these
// rows is recent enough that the month and the day are the answer.
export const shortDay = (iso: string): string =>
  new Date(iso.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

// What the merge will actually do to the log, in one sentence — the well's
// first line. Says the count, when, and how much, because those three are what
// tells him whether this is the right vendor to fold the name into.
//
// A row with no cost on any service omits the dollars rather than printing a
// "—": null is "nobody wrote a price down", and $0 would be a lie.
export const mergeSentence = (row: UnfiledShop, into: string): string => {
  const n = row.service_count;
  const rows = `${n} log row${n === 1 ? "" : "s"}`;

  const parts: string[] = [];
  if (row.last_service)
    parts.push(n === 1 ? shortDay(row.last_service) : `last ${shortDay(row.last_service)}`);
  if (row.total_spend != null)
    parts.push(
      n === 1
        ? moneyCents(Number(row.total_spend))
        : `${moneyCents(Number(row.total_spend))} in all`,
    );

  const detail = parts.length > 0 ? ` (${parts.join(", ")})` : "";
  return `${rows}${detail} will read ${into}.`;
};
