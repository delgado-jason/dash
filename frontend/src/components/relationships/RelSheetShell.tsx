import type { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";

// One shell for every sheet on the Relationships surface: a bottom sheet on
// the phone (Brandie's thumb), a centered dialog from md up. Both are Radix
// dialogs — Escape, backdrop and ✕ close it, focus is trapped, role=dialog.
// The house wrappers default to modal={false}; passing `modal` restores the
// trap and the outside-click dismissal.
interface Props {
  open: boolean;
  onClose: () => void;
  title: string; // read by screen readers; the body draws its own header
  description?: string;
  children: ReactNode;
}

export const RelSheetShell = ({ open, onClose, title, description, children }: Props) => {
  const mobile = useIsMobile();
  const onOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  if (mobile) {
    return (
      <Sheet open={open} modal onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="bg-canvas text-ink border-hairline rounded-t-[16px] p-0 gap-0 max-h-[92vh] overflow-y-auto"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description ?? title}</SheetDescription>
          </SheetHeader>
          {children}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} modal onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
      </DialogPortal>
      <DialogContent className="bg-canvas text-ink border-hairline rounded-[14px] p-0 gap-0 sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description ?? title}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
};
