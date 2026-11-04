import { useEffect, useMemo, useState } from "react";
import { anchorDay, localDayKey } from "@/lib/metrics/today";

// The operator's local day key, refreshed every minute so a tab left open
// rolls to the new day at midnight instead of freezing on the day it mounted
// (call 13, 2026-11-04 — dash is desktop-first; a tab lives for days).
export const useLocalTodayKey = (): string => {
  const [key, setKey] = useState(() => localDayKey(new Date()));
  useEffect(() => {
    const id = setInterval(() => {
      const k = localDayKey(new Date());
      setKey((prev) => (prev === k ? prev : k));
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  return key;
};

// The same day ANCHORED (a UTC-midnight Date) for the metric functions, which
// read their clock through UTC getters. Stable across renders within a day.
export const useLocalToday = (): Date => {
  const key = useLocalTodayKey();
  return useMemo(() => anchorDay(key), [key]);
};
