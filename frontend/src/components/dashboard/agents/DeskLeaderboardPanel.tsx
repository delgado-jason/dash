import { useState } from "react";
import type { Load } from "@/types/load";
import type { RateLadder } from "@/lib/metrics/rateTargets";
import { useDeskBoard } from "@/hooks/useDeskBoard";
import { Leaderboard } from "./Leaderboard";

// The desk leaderboard, self-contained: it fetches what it needs and fixes its
// own clock. The owner's Agents tab drives the board's window itself, so it
// uses the hook directly; this wrapper is for the screens that just want the
// board as it stands — today Brandie's dispatcher dashboard, which books the
// freight and until now never said which desks pay.
export const DeskLeaderboardPanel = ({
  loads,
  ladder,
}: {
  loads: Load[];
  ladder: RateLadder | null;
}) => {
  const [now] = useState(() => new Date());
  const { board, contactsFailed, failed } = useDeskBoard(loads, ladder, now);
  return (
    <Leaderboard
      board={board}
      ladder={ladder}
      now={now}
      contactsFailed={contactsFailed}
      failed={failed}
    />
  );
};
