import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { installErrorHooks } from "./lib/telemetry";

// Identity lives in localStorage, which every tab shares. When ANOTHER tab
// logs in, logs out, or switches users, this tab's in-memory UI is suddenly
// wearing the wrong identity (2026-08-16: Jason's admin/dispatch chimera —
// stale tab + new login = no-name user and someone else's award pops). The
// storage event only fires for changes made by OTHER tabs; reloading re-derives
// the entire app — route guard included — from whatever the session now is.
const IDENTITY_KEYS = new Set(["token", "user_id", "role", "display_name"]);
window.addEventListener("storage", (e) => {
  if (e.key === null || IDENTITY_KEYS.has(e.key)) window.location.reload();
});

// Errors that leave a page by the window (thrown, unhandled promise) are
// recorded for the owner; a render crash is caught by the boundary below.
installErrorHooks();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
);
