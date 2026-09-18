import { useState, useEffect, useCallback } from "react";
import type { SiteTraffic, TrafficWindow } from "@/types/siteTraffic";
import { getSiteTraffic } from "@/services/siteTrafficService";

// What the last SETTLED fetch answered, tagged with the request it answered —
// the same shape useLoads keeps, and for the same reason: loading and error are
// DERIVED from it, so neither needs a setState in the effect body (which
// triggers a cascading render, and the lint rule that says so).
interface Settled {
  key: string;
  error: string | null;
}

// The website's traffic for one window. Changing the window refetches, and the
// `active` flag drops a response that lands after the window already moved —
// otherwise flipping 7d → 12m while the first request is in flight can paint
// seven days of bars under a "12 months" label.
export const useSiteTraffic = (window: TrafficWindow) => {
  const [traffic, setTraffic] = useState<SiteTraffic | null>(null);
  const [settled, setSettled] = useState<Settled | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const reqKey = `${window}:${refreshKey}`;

  const refetch = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let active = true;
    getSiteTraffic(window).then(
      (data) => {
        if (!active) return;
        setTraffic(data);
        setSettled({ key: reqKey, error: null });
      },
      () => {
        if (!active) return;
        setSettled({ key: reqKey, error: "Failed to load the website's traffic" });
      },
    );
    return () => {
      active = false;
    };
  }, [window, reqKey]);

  return {
    traffic, // the last window that LANDED — it stays on screen while the next loads
    loading: settled?.key !== reqKey,
    // The last failure, cleared the moment a retry starts.
    error: settled?.key === reqKey ? settled.error : null,
    refetch,
  };
};
