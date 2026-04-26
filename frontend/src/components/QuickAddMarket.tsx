import { useState } from "react";
import type { Market } from "@/types/market";
import type { CreateMarketInput } from "@/types/createMarketInput";
import { createMarket } from "@/services/createMarketService";

// ---- UI COMPONENTS ----
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// ---- PROP INTERFACE ----
interface QuickAddMarketProp {
  fieldName: "origin_market_id" | "destination_market_id";
  onSuccess: (
    newMarket: Market,
    fieldName: "origin_market_id" | "destination_market_id",
  ) => void;
  onCancel: () => void;
}

export const QuickAddMarket = ({
  fieldName,
  onSuccess,
  onCancel,
}: QuickAddMarketProp) => {
  const [market, setMarket] = useState<CreateMarketInput>({
    market_name: "",
    notes: null,
  });

  const [error, setError] = useState<string | null>(null);

  // ---- HANDLERS FOR FORM ----
  const handleClick = async () => {
    try {
      const newMarket = await createMarket(market);
      onSuccess(newMarket, fieldName);
    } catch (e) {
      setError("Unable to create a new market");
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMarket({
      ...market,
      [e.target.name]: e.target.value,
    });
  };

  const handleCancelClick = () => {
    onCancel();
  };

  // ---- JSX ----
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>+ New</Button>
      </DialogTrigger>
      <DialogContent className="overflow-y-auto max-h-[80vh] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Create a New Market</DialogTitle>
        </DialogHeader>
        <div>
          {/* Market name field */}
          <div>
            <Label htmlFor="market_name">Market Name</Label>
            <Input
              name="market_name"
              id="market_name"
              onChange={handleChange}
            />
          </div>
          {/* Market notes textarea */}
          <div>
            <Label htmlFor="notes">Market Notes</Label>
            <Textarea
              name="notes"
              id="notes"
              placeholder="Enter a note for this market"
              onChange={(e) => {
                setMarket({
                  ...market,
                  notes: e.target.value,
                });
              }}
            />
          </div>
          <div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <Button onClick={handleClick}>Create Market</Button>
            <Button onClick={handleCancelClick}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
