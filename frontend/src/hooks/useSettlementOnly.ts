import { useCallback, useEffect, useState } from "react";
import { getSettlementOnly } from "@/services/agenciesService";
import type { SettlementOnlyRow } from "@/lib/agencies/agencyMetrics";

// The settlement-only shelf's slice, fetched on its own so a failed read
// degrades the shelf alone: the agency list above it is real data and must not
// disappear because one extra query fell over. `since` stays null until the
// server answers — the shelf's head prints the year the QUERY used, never a
// year the page guessed from its own clock.
export const useSettlementOnly = (refreshKey: number = 0) => {
  const [rows, setRows] = useState<SettlementOnlyRow[]>([]);
  const [since, setSince] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ONE read, two callers: the mount effect and the lamp's retry. `isLoading`
  // goes up and the stale sentence comes down BEFORE the request starts, or a
  // retry looks exactly like the failure it is trying to clear — no spinner,
  // the old error still sitting there.
  //
  // `isActive` is how the mount effect drops a response that lands after
  // unmount; the retry passes nothing and always applies.
  const load = useCallback(async (isActive: () => boolean = () => true) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getSettlementOnly();
      if (!isActive()) return;
      setRows(data.rows);
      setSince(data.since);
    } catch (e) {
      if (isActive()) {
        setError(e instanceof Error ? e.message : "couldn't load the settlement-only history");
      }
    } finally {
      if (isActive()) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void load(() => active);
    return () => {
      active = false;
    };
  }, [load, refreshKey]);

  return { rows, since, isLoading, error, reload: load };
};
