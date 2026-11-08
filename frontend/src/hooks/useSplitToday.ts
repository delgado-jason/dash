import { useEffect, useMemo, useState } from "react";
import type { SettlementSplit } from "@/types/settlementSplit";
import { getSettlementSplits } from "@/services/settlementSplitService";
import { splitInForce } from "@/lib/metrics/splits";
import { localDayKey } from "@/lib/metrics/today";
import { useLocalToday } from "@/hooks/useLocalToday";

// The pay split in force today (settlement_splits, NET-01) for the pages that
// hand the cost basis its linehaul take. null until loaded or when no split
// covers today — the basis then falls back to its blended keep, never a guess.
export const useSplitToday = (): SettlementSplit | null => {
  const [splits, setSplits] = useState<SettlementSplit[]>([]);
  const now = useLocalToday();
  useEffect(() => {
    let active = true;
    getSettlementSplits()
      .then((rows) => {
        if (active) setSplits(rows);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return useMemo(() => splitInForce(splits, localDayKey(now)), [splits, now]);
};
