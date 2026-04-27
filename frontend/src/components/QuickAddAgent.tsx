import { Button } from "@/components/ui/button";

interface QuickAddAgentProp {
  onOpen: () => void;
}

export const QuickAddAgent = ({ onOpen }: QuickAddAgentProp) => {
  return <Button onClick={onOpen}>+ New</Button>;
};
