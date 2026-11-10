import type { ReactNode } from "react";

// The surface LoadForm opens on. Both call sites — "New load" on the Loads
// page and "Edit" on a load's page — hand-rolled the same eleven classes until
// v1.267.2, so a change to one quietly disagreed with the other.
//
// The tokens here are deliberate, not inherited: `bg-panel` is the raised
// surface (`bg-canvas` is the page behind it) and `rounded-xl` resolves to
// 14px, which is what RelSheetShell uses. Ten other pages float their modals
// on `bg-canvas` at 12px; that is the drift, and it is not this file's to fix.
//
// `role`/`aria-label` name the dialog for a screen reader. There is no
// `aria-modal` and no Escape key: neither would be true without a focus trap,
// and arming one around LoadForm's Radix selects and date popovers is a
// behaviour change that belongs with the app-wide modal pass, not here.
interface Props {
  open: boolean;
  onClose: () => void;
  label: string; // read by screen readers; the form draws its own heading
  children: ReactNode;
}

export const LoadFormModal = ({ open, onClose, label, children }: Props) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-label={label}
        className="relative w-full max-w-[750px] mx-4 max-h-[90vh] bg-panel text-ink overflow-y-auto shadow-xl rounded-xl p-4 sm:p-6 border border-hairline"
      >
        {children}
      </div>
    </div>
  );
};

export default LoadFormModal;
