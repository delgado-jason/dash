import type { QuarterWeeks } from "@/lib/metrics/grind";

// The one plain stat under what used to be the heat meter (the Cockpit, call
// 11): the same words on both dashboards, so the owner's Money tab and the
// dispatch board can never describe the quarter two ways.
export interface WeeksWords {
  label: string; // the eyebrow
  figure: string; // "7 of 9"
  detail: string; // the sentence under it
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export const weeksWords = (v: QuarterWeeks): WeeksWords => {
  const label = "Weeks over break-even this quarter";
  const home = v.home > 0 ? ` · ${plural(v.home, "home week")} not counted` : "";
  if (v.counted === 0) {
    return {
      label,
      figure: "—",
      detail: `${v.label} has no completed pay week with freight yet${home}`,
    };
  }
  if (!v.hasBars) {
    return {
      label,
      figure: `— of ${v.counted}`,
      detail: `${plural(v.counted, "completed week")} with freight in ${v.label} · the floor and target need a filed P&L month`,
    };
  }
  return {
    label,
    figure: `${v.overFloor} of ${v.counted}`,
    detail: `${v.label} · ${v.atTarget} at or above the weekly target${home}`,
  };
};
