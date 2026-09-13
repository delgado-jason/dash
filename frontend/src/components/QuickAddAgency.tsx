// ---- UI COMPONENTS ----

import { Button } from "@/components/ui/button";

// ---- PROP INTERFACE ----

interface QuickAddAgencyProp {
  onOpen: () => void;
}

export const QuickAddAgency = ({ onOpen }: QuickAddAgencyProp) => {
  // ---- JSX ----
  return <Button onClick={onOpen}>+ New</Button>;
};
