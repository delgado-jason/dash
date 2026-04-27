// ---- UI COMPONENTS ----

import { Button } from "@/components/ui/button";

// ---- PROP INTERFACE ----

interface QuickAddBrokerProp {
  onOpen: () => void;
}

export const QuickAddBroker = ({ onOpen }: QuickAddBrokerProp) => {
  // ---- JSX ----
  return <Button onClick={onOpen}>+ New</Button>;
};
