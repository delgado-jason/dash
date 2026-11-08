// THE THEME — Night Cab and Day Cab are one token set with two value sets
// (index.css: `.dark` carries the night values, `:root` the day values). This
// module owns the choice: three preferences (system · light · dark), stored on
// THIS device only, resolved against the operating system's setting, applied
// to the root element as the `dark` class (shadcn + Tailwind variants) and a
// `data-theme` attribute, and announced to every subscriber (the sidebar
// toggle, the Settings control) so they never disagree.
//
// index.html applies the same rule in an inline script before the first paint,
// so a dark-device user never sees a white flash; this module takes over once
// the app mounts. The Nod Sheet "The Redesign", phase A, calls A1 and A2.

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_KEY = "dash.theme";
export const THEME_COLOR: Record<ResolvedTheme, string> = { dark: "#0b0f17", light: "#f2f4f8" };

export const parsePreference = (v: unknown): ThemePreference =>
  v === "light" || v === "dark" ? v : "system";

export const resolveTheme = (pref: ThemePreference, systemDark: boolean): ResolvedTheme =>
  pref === "system" ? (systemDark ? "dark" : "light") : pref;

// The one-tap toggle: from whatever shows now to the other, as an explicit
// choice (system is left by tapping; Settings offers it back).
export const nextToggle = (resolved: ResolvedTheme): ThemePreference =>
  resolved === "dark" ? "light" : "dark";

const hasWindow = typeof window !== "undefined";

const readStored = (): ThemePreference => {
  try {
    return parsePreference(hasWindow ? window.localStorage.getItem(THEME_KEY) : null);
  } catch {
    return "system";
  }
};

const mediaQuery = (): MediaQueryList | null =>
  hasWindow && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

export const applyTheme = (resolved: ResolvedTheme, root: HTMLElement | null = hasWindow ? document.documentElement : null): void => {
  if (!root) return;
  root.classList.toggle("dark", resolved === "dark");
  root.setAttribute("data-theme", resolved);
  const meta = root.ownerDocument.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLOR[resolved]);
};

// ---- the store --------------------------------------------------------------
let preference: ThemePreference = readStored();
let systemDark: boolean = mediaQuery()?.matches ?? true;
const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach((fn) => fn());

export const getPreference = (): ThemePreference => preference;
export const getResolved = (): ResolvedTheme => resolveTheme(preference, systemDark);
export const subscribe = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const setPreference = (next: ThemePreference): void => {
  preference = next;
  try {
    if (next === "system") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, next);
  } catch {
    // storage unavailable (a private window): the choice lasts the session
  }
  applyTheme(getResolved());
  emit();
};

// System follows the device live; another tab's choice reaches this one.
const mq = mediaQuery();
if (mq) {
  mq.addEventListener("change", (e) => {
    systemDark = e.matches;
    applyTheme(getResolved());
    emit();
  });
}
if (hasWindow) {
  window.addEventListener("storage", (e) => {
    if (e.key === THEME_KEY) {
      preference = parsePreference(e.newValue);
      applyTheme(getResolved());
      emit();
    }
  });
  applyTheme(getResolved());
}
