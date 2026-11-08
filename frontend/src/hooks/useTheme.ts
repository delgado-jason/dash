import { useSyncExternalStore } from "react";
import {
  getPreference,
  getResolved,
  nextToggle,
  setPreference,
  subscribe,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

// The theme as React state, from the one store in lib/theme: every control
// that reads it shows the same answer, and a change anywhere updates them all.
export const useTheme = (): {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (p: ThemePreference) => void;
  toggle: () => void;
} => {
  const preference = useSyncExternalStore(subscribe, getPreference, getPreference);
  const resolved = useSyncExternalStore(subscribe, getResolved, getResolved);
  return {
    preference,
    resolved,
    setPreference,
    toggle: () => setPreference(nextToggle(resolved)),
  };
};
