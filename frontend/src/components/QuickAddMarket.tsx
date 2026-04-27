import { Button } from "@/components/ui/button";

interface QuickAddMarketProp {
  fieldName: "origin_market_id" | "destination_market_id";
  onOpen: (fieldName: "origin_market_id" | "destination_market_id") => void;
}

export const QuickAddMarket = ({ fieldName, onOpen }: QuickAddMarketProp) => {
  return <Button onClick={() => onOpen(fieldName)}>+ New</Button>;
};
