// One-line "how to earn" for every dispatcher achievement — the single source of
// truth, shown on the forge-room card, in the earned-award pop, and in the Guide,
// so a cryptic name like "Whale" or "Backhaul Boss" is never a mystery. Keyed by
// the same medal/patch/season keys the award engines use.
export const DISPATCHER_HOW_TO: Record<string, string> = {
  // medals (rare feats)
  "disp-steal": "Book a load the Scorer grades a STEAL",
  "disp-double-up": "Book a load paying 2× your break-even",
  "disp-whale": "Book a load grossing $10k or more",
  "disp-superload": "Book a superload — 16'+ wide/tall, 150'+ long, or 200k lb",
  "disp-perfect-week": "A week where every load beats your target rate",
  "disp-grand-slam": "A steal that's on-time both ends, under 10% deadhead",
  "disp-big-week": "Book 5+ loads in one week",
  // patches (the grind)
  "disp-deal-closer": "Every load you book",
  "disp-rainmaker": "Total gross you've booked",
  "disp-rate-hawk": "Book a load at or above your target rate",
  "disp-iron-booker": "Weeks in a row hitting your booking pace",
  "disp-bounty": "Loads where you collected detention",
  "disp-right-hand": "Loads booked with a single agent",
  "disp-clockwork": "Loads on-time at pickup AND delivery",
  "disp-quick-turn": "Book the next load within a day of delivering",
  "disp-oversize": "Book oversize loads",
  "disp-lean": "Loads that ran with low deadhead",
  "disp-backhaul-boss": "Book a return leg from where you last delivered",
  // season crowns
  booking: "Book the most loads this period",
  rate: "Book the highest average rate this period",
  perfect: "Deliver every load on-time this period",
};

export const howToEarn = (key: string): string => DISPATCHER_HOW_TO[key] ?? "";
