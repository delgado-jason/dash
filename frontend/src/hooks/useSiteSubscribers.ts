import { useState, useEffect, useCallback } from "react";
import type { SiteSubscribers, TrafficWindow } from "@/types/siteTraffic";
import { getSiteSubscribers } from "@/services/siteSubscribersService";

// What the last SETTLED fetch answered, tagged with the request it answered —
// the same shape useSiteTraffic keeps, and for the same reason: loading and
// error are DERIVED from it, so neither needs a setState in the effect body
// (which triggers a cascading render, and the lint rule that says so).
interface Settled {
  key: string;
  error: string | null;
}

// The Logbook's signups for one window. A SECOND fetch alongside the traffic
// rather than a field on it: the two boards fail independently, so a signups
// request that breaks must leave the visitor figures standing.
export const useSiteSubscribers = (window: TrafficWindow) => {
  const [subscribers, setSubscribers] = useState<SiteSubscribers | null>(null);
  const [settled, setSettled] = useState<Settled | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const reqKey = `${window}:${refreshKey}`;

  const refetch = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let active = true;
    getSiteSubscribers(window).then(
      (data) => {
        if (!active) return;
        setSubscribers(data);
        setSettled({ key: reqKey, error: null });
      },
      () => {
        if (!active) return;
        setSettled({ key: reqKey, error: "Failed to load the signups" });
      },
    );
    return () => {
      active = false;
    };
  }, [window, reqKey]);

  return {
    subscribers, // the last window that LANDED — it stays on screen while the next loads
    loading: settled?.key !== reqKey,
    // The last failure, cleared the moment a retry starts.
    error: settled?.key === reqKey ? settled.error : null,
    refetch,
  };
};
