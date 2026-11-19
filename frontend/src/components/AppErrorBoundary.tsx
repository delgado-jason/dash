import { Component, type ErrorInfo, type ReactNode } from "react";
import { sendError } from "@/lib/telemetry";

interface State {
  error: Error | null;
}

// The last door a render crash leaves by. Without this a thrown render is a
// white page and no record; with it the person gets a sentence and a reload,
// and the owner gets the row under Integrity → The app itself. A class on
// purpose: React has no hook for componentDidCatch.
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    sendError("render", error.message, `${error.stack ?? ""}\n${info.componentStack ?? ""}`);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-iron text-light font-body p-6">
        <div className="ds-panel ds-panel--default p-5 max-w-[560px]">
          <h1 className="font-condensed text-lg text-light">dash hit an error drawing this page</h1>
          <p className="text-sm text-muted-text mt-1">
            It has been recorded for the owner. Reload the page; if it happens again,
            go to the dashboard and say which page it was.
          </p>
          <p className="text-xs text-faint mt-2 font-mono break-words">{this.state.error.message}</p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-sm px-4 py-1.5 rounded-lg"
              style={{ background: "var(--color-amber)", color: "var(--color-on-amber)" }}
            >
              Reload
            </button>
            <a href="/dashboard" className="text-sm px-4 py-1.5 rounded-lg text-muted-text hover:text-light">
              Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }
}
