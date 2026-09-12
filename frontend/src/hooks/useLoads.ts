import { useState, useEffect } from "react";
import type { Load } from "@/types/load";
import { getLoads } from "@/services/loadsService";

// What the last SETTLED fetch said, tagged with the refreshKey it answered.
// Loading, fetching and error are all derived from it, so a bumped key reads
// as "in flight" — and a retry after a failure reads as no longer failed —
// without a setState in the effect body.
interface Settled {
  key: number;
  error: string | null;
}

export const useLoads = (refreshKey: number) => {
  const [loads, setLoads] = useState<Load[]>([]);
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    let active = true; // a response landing after unmount, or after a newer key, is dropped
    getLoads().then(
      (data) => {
        if (!active) return;
        setLoads(data);
        setSettled({ key: refreshKey, error: null });
      },
      () => {
        if (active) setSettled({ key: refreshKey, error: "Failed to load loads" });
      },
    );
    return () => {
      active = false;
    };
  }, [refreshKey]);

  return {
    loads,
    // The FIRST fetch — pages swap in their spinner on this; a refresh keeps
    // the current list on screen.
    isLoading: settled == null,
    // Any fetch in flight, retries included — for a surface that must not
    // show stale or confident numbers in the meantime.
    isFetching: settled?.key !== refreshKey,
    // The last failure. Cleared the moment a retry starts; gone for good once
    // it lands, back if it fails again.
    error: settled?.key === refreshKey ? settled.error : null,
  };
};
