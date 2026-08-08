// Design System v2 — the motion layer's single vocabulary.
// Mirrors the :root custom properties in index.css so CSS transitions and
// GSAP timelines speak the same durations and eases. Import from here;
// never hardcode a duration or cubic-bezier in a component.
//
// Motion always plays: the app deliberately does not honor
// prefers-reduced-motion (owner's decision, 2026-08-08). Do not add a
// reduced gate here without Jason's sign-off.

// Durations in seconds (GSAP units). CSS uses the ms custom properties.
export const DUR = {
  fast: 0.12, // hovers, focus rings
  quick: 0.24, // chips, toggles, tooltips
  base: 0.5, // section rise, board boot
  slow: 0.9, // count-ups, needle sweeps, chart draws
} as const;

// CSS easing strings — identical to the :root custom properties.
export const EASE = {
  mech: "cubic-bezier(0.22, 1, 0.36, 1)", // the house ease
  settle: "cubic-bezier(0.22, 1.4, 0.36, 1)", // forged plates only — one overshoot
  strikeIn: "cubic-bezier(0.55, 0, 1, 0.45)", // the press drop
  slam: "cubic-bezier(0.2, 1.6, 0.4, 1)", // stamps + punches landing
} as const;

// GSAP-native equivalents for timelines (avoids the CustomEase plugin).
export const GSAP_EASE = {
  mech: "power3.out",
  settle: "back.out(1.4)",
  strikeIn: "power2.in",
  slam: "back.out(2)",
} as const;

// Boot-sequence stagger in seconds — one orchestrated moment per view.
export const STAGGER = {
  tight: 0.06,
  base: 0.09,
} as const;
