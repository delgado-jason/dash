import { X } from "lucide-react";

// The surface's one toast: "Logged · Guy Lovan · Capacity heads-up — undo".
// The layout owns the 6-second timer; this just draws whatever is current.
export interface ToastState {
  id: number;
  message: string;
  action?: { label: string; run: () => void | Promise<void> };
}

export const Toast = ({ toast, onDismiss }: { toast: ToastState | null; onDismiss: () => void }) => {
  if (!toast) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 -translate-x-1/2 bottom-5 z-[60] flex items-center gap-3 h-11 px-4 rounded-[12px] bg-panel border border-hairline shadow-xl font-condensed text-[14px] text-ink max-w-[calc(100%-2rem)]"
    >
      <span className="truncate">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            void toast.action?.run();
            onDismiss();
          }}
          className="font-semibold text-amber-hi hover:text-hot shrink-0"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-faint hover:text-ink shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  );
};
