import { useState } from "react";
import type { Broker } from "@/types/broker";
import type { CreateBrokerInput } from "@/types/createBrokerInput";
import { createBroker } from "@/services/createBrokerService";

// ---- UI COMPONENTS ----
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// ---- PROP INTERFACE ----
interface QuickAddBrokerProp {
  onSuccess: (newBroker: Broker) => void;
  onCancel: () => void;
}

export const QuickAddBroker = ({ onSuccess, onCancel }: QuickAddBrokerProp) => {
  const [broker, setBroker] = useState<CreateBrokerInput>({
    broker_name: "",
    phone: null,
    email: null,
    rating: null,
    notes: null,
  });

  const [error, setError] = useState<string | null>(null);

  // ---- HANDLERS FOR FORM ----
  const handleClick = async () => {
    try {
      const newBroker = await createBroker(broker);
      onSuccess(newBroker);
    } catch (e) {
      setError("Unable to create a new broker");
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBroker({
      ...broker,
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
          <DialogTitle>Create a New Broker</DialogTitle>
        </DialogHeader>
        <div>
          {/* Broker name field */}
          <div>
            <Label htmlFor="broker_name">Broker Name</Label>
            <Input
              name="broker_name"
              id="broker_name"
              placeholder="ABC"
              onChange={handleChange}
            />
          </div>
          {/* Broker phone field */}
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input name="phone" id="phone" onChange={handleChange} />
          </div>
          {/* Broker email field */}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              type="email"
              name="email"
              id="email"
              onChange={handleChange}
            />
          </div>
          {/* Broker rating select */}
          <div>
            <Label htmlFor="rating">Broker Rating</Label>
            <Select
              onValueChange={(value) => {
                setBroker({
                  ...broker,
                  rating: Number(value),
                });
              }}
            >
              <SelectTrigger className="w-full max-w-48">
                <SelectValue placeholder="Select a rating" />
              </SelectTrigger>
              <SelectContent>
                {/* Need to convert values to Number */}
                <SelectGroup>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="4">4</SelectItem>
                  <SelectItem value="5">5</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          {/* Broker notes textarea */}
          <div>
            <Label htmlFor="notes">Broker Notes</Label>
            <Textarea
              name="notes"
              id="notes"
              placeholder="Enter a note for this broker"
              onChange={(e) => {
                setBroker({
                  ...broker,
                  notes: e.target.value,
                });
              }}
            />
          </div>
          <div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <Button onClick={handleClick}>Create Broker</Button>
            <Button onClick={handleCancelClick}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
