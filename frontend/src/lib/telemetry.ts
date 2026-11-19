import api from "@/services/api";

// dash about itself: a page opened, an error caught. Both are fire-and-forget —
// a beacon that fails must never be felt on the page, so every send swallows
// its own error and nothing here throws. The server keeps the rows
// (migration 114); the Integrity page's "The app itself" part and the watcher
// on the DTS server read them.

// The same path twice inside this window is one opening (StrictMode mounts
// twice; a redirect lands on the same route).
export const HIT_DEDUPE_MS = 2000;

// At most this many error reports a minute from one tab — a loop reports a
// minute's worth, not forever — and the same message once a minute.
export const ERROR_BURST = { max: 10, windowMs: 60_000 } as const;

// Browser noise that is not an error in dash.
export const IGNORED = [/ResizeObserver loop/];

export interface LastHit {
  path: string;
  at: number;
}

export const shouldSendHit = (path: string, now: number, last: LastHit | null): boolean =>
  !last || last.path !== path || now - last.at > HIT_DEDUPE_MS;

// The error budget: the sends still inside the window, and whether one more fits.
export const withinBudget = (
  sent: number[],
  now: number,
  { max, windowMs }: { max: number; windowMs: number } = ERROR_BURST,
): { ok: boolean; sent: number[] } => {
  const live = sent.filter((t) => now - t < windowMs);
  return { ok: live.length < max, sent: live };
};

export const ignored = (message: string): boolean => IGNORED.some((re) => re.test(message));

const token = (): string | null => {
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
};

let lastHit: LastHit | null = null;

// A page opened. Only a signed-in person is a visit worth counting.
export function sendHit(path: string): void {
  const now = Date.now();
  if (!shouldSendHit(path, now, lastHit)) return;
  lastHit = { path, at: now };
  if (!token()) return;
  api.post("/app/hits", { path }).catch(() => {});
}

export type ErrorKind = "error" | "rejection" | "render";

let sentAt: number[] = [];
let lastMessage: { message: string; at: number } | null = null;

// An error caught. Plain fetch with keepalive, not the axios instance: a report
// sent as the page unloads must still go, and a 401 on it must never bounce
// the person to the login page.
export function sendError(kind: ErrorKind, message: unknown, stack?: string | null): void {
  const text = String(message ?? "").trim() || "(no message)";
  if (ignored(text)) return;
  const now = Date.now();
  if (lastMessage && lastMessage.message === text && now - lastMessage.at < ERROR_BURST.windowMs) return;
  const budget = withinBudget(sentAt, now);
  sentAt = budget.sent;
  if (!budget.ok) return;
  sentAt.push(now);
  lastMessage = { message: text, at: now };

  const bearer = token();
  if (!bearer) return;
  const body = JSON.stringify({
    kind,
    message: text.slice(0, 500),
    stack: stack ? String(stack).slice(0, 4000) : null,
    path: window.location.pathname,
    app_version: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : null,
    user_agent: navigator.userAgent.slice(0, 300),
  });
  try {
    void fetch(`${api.defaults.baseURL}/app/errors`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
      body,
    }).catch(() => {});
  } catch {
    // nothing to do — a beacon never surfaces
  }
}

let installed = false;

// The two doors an error leaves a page by: a thrown error and an unhandled
// promise. Render crashes come through AppErrorBoundary.
export function installErrorHooks(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    const err = e.error as { message?: string; stack?: string } | undefined;
    sendError("error", e.message || err?.message, err?.stack);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason as { message?: string; stack?: string } | undefined;
    sendError("rejection", r?.message ?? String(e.reason), r?.stack);
  });
}
