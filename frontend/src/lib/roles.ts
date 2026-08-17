// Role helpers for the delegated-access model (#277). The owner is `admin`;
// a dispatcher logs in under the owner's account. This is a FRONTEND view
// boundary (Phase 2) — it tailors what a dispatcher sees, it is NOT hard
// security. The API still scopes every request to the account, so the owner's
// data is reachable by the dispatcher's token; we simply don't route her there.

export const getRole = (): string => localStorage.getItem("role") ?? "admin";

export const isDispatcher = (): boolean => getRole() === "dispatcher";

// Routes only the owner/admin opens. A dispatcher who lands on one (typed URL,
// stale link) is bounced to her dashboard. Keep this in lockstep with the
// `adminOnly` flags in AppSidebar so the nav and the guard never disagree.
export const ADMIN_ONLY_PREFIXES = [
  "/expenses",
  "/status",
  "/per-diem",
  "/recap",
  "/garage",
  "/trophy-room",
  "/trophy-studio",
  "/fuel-entries",
  "/settings",
];

export const isAdminOnlyPath = (pathname: string): boolean =>
  ADMIN_ONLY_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
