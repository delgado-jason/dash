import { useState } from "react";
import type { Agent } from "@/types/agent";
import type { Broker } from "@/types/broker";
import type { CreateAgentInput } from "@/types/createAgentInput";
import { createAgent } from "@/services/createAgentService";

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
interface QuickAddAgentProp {
  brokers: Broker[];
  onSuccess: (newAgent: Agent) => void;
  onCancel: () => void;
}

export const QuickAddAgent = ({
  brokers,
  onSuccess,
  onCancel,
}: QuickAddAgentProp) => {
  const [agent, setAgent] = useState<CreateAgentInput>({
    broker_id: "",
    first_name: "",
    last_name: "",
    phone: null,
    email: null,
    preferred_contact: null,
    rating: null,
    notes: null,
  });

  const [error, setError] = useState<string | null>(null);

  // ---- HANDLERS FOR FORM ----
  const handleClick = async () => {
    try {
      const newAgent = await createAgent(agent);
      onSuccess(newAgent);
    } catch (e) {
      setError("Unable to create a new agent");
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAgent({
      ...agent,
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
          <DialogTitle>Create a New Agent</DialogTitle>
        </DialogHeader>
        <div>
          {/* Broker name selects */}
          <div>
            <Label htmlFor="brokers">Broker</Label>
            <Select
              onValueChange={(value) => {
                setAgent({
                  ...agent,
                  broker_id: value,
                });
              }}
            >
              <SelectTrigger className="w-full max-w-48">
                <SelectValue placeholder="Select a method" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {brokers.map((broker) => (
                    <SelectItem key={broker.broker_id} value={broker.broker_id}>
                      {broker.broker_name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          {/* Agent first name field */}
          <div>
            <Label htmlFor="first_name">First Name</Label>
            <Input name="first_name" id="first_name" onChange={handleChange} />
          </div>
          {/* Agent last name field */}
          <div>
            <Label htmlFor="last_name">Last Name</Label>
            <Input name="last_name" id="last_name" onChange={handleChange} />
          </div>
          {/* Agent phone field */}
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input name="phone" id="phone" onChange={handleChange} />
          </div>
          {/* Agent email field */}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              type="email"
              name="email"
              id="email"
              onChange={handleChange}
            />
          </div>
          {/* Agent preferred contact selects */}
          <div>
            <Label htmlFor="preferred_contact">Preferred Contact Method</Label>
            <Select
              onValueChange={(value) => {
                setAgent({
                  ...agent,
                  preferred_contact: value,
                });
              }}
            >
              <SelectTrigger className="w-full max-w-48">
                <SelectValue placeholder="Select a method" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          {/* Agent rating selects */}
          <div>
            <Label htmlFor="rating">Agent Rating</Label>
            <Select
              onValueChange={(value) => {
                setAgent({
                  ...agent,
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
          {/* Agent notes textarea */}
          <div>
            <Label htmlFor="notes">Agent Notes</Label>
            <Textarea
              name="notes"
              id="notes"
              placeholder="Enter a note for this agent"
              onChange={(e) => {
                setAgent({
                  ...agent,
                  notes: e.target.value,
                });
              }}
            />
          </div>
          <div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <Button onClick={handleClick}>Create Agent</Button>
            <Button onClick={handleCancelClick}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
