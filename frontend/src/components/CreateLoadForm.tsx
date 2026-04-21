import { useState } from "react";
import type { Broker } from "@/types/broker";
import type { Agent } from "@/types/agent";
import type { Market } from "@/types/market";
import type { CreateLoadInput } from "@/types/createLoadInput";

// UI Component Imports
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Interface for the createLoadForm props
interface CreateLoadFormProps {
  brokers: Broker[];
  agents: Agent[];
  markets: Market[];
  onSuccess: () => void;
}

const CreateLoadForm = ({
  brokers,
  agents,
  markets,
  onSuccess,
}: CreateLoadFormProps) => {
  const [formData, setFormData] = useState<CreateLoadInput>({
    load_number: "",
    broker_id: "",
    agent_id: "",
    load_type: "standard flatbed",
    load_status: "booked",
    pickup_date: "",
    delivery_date: null,
    origin_city: "",
    origin_state: "",
    origin_market_id: "",
    destination_city: "",
    destination_state: "",
    destination_market_id: "",
    commodity: null,
    weight: null,
    dimensions: null,
    shipper_name: null,
    receiver_name: null,
    linehaul: 0,
    fuel_surcharge: 0,
    deadhead_miles: null,
    loaded_miles: null,
    payment_status: "unpaid",
  });

  // Filters agents to the broker
  const filteredAgents = agents.filter(
    (agent) => agent.broker_id === formData.broker_id,
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open Dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <div>
          <DialogHeader>
            <DialogTitle>Create Load</DialogTitle>
            <DialogDescription className="sr-only">
              Create a new load
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">Identification</h3>
            <div className="grid grid-cols-2 gap-3">
              <Label htmlFor="load_number">Load Number</Label>
              <Input
                name="load_number"
                id="load_number"
                onChange={handleChange}
              ></Input>

              <Select
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    broker_id: value,
                    agent_id: "",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a broker" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {brokers.map((broker) => (
                      <SelectItem
                        key={broker.broker_id}
                        value={broker.broker_id}
                      >
                        {broker.broker_name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>

              <Select
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    agent_id: value,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an agent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {filteredAgents.map((agent) => (
                      <SelectItem key={agent.agent_id} value={agent.agent_id}>
                        {agent.first_name + " " + agent.last_name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>

              <Select
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    load_type: value,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select the load type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="standard flatbed">
                      Standard Flatbed
                    </SelectItem>
                    <SelectItem value="oversize">Oversize</SelectItem>
                    <SelectItem value="heavy haul">Heavy Haul</SelectItem>
                    <SelectItem value="hazmat">Hazmat</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">When</h3>
            <div className="grid grid-cols-2 gap-3">
              <Label htmlFor="pickup_date">Pickup Date</Label>
              <Input
                type="date"
                name="pickup_date"
                id="pickup_date"
                onChange={handleChange}
              ></Input>
              <Label htmlFor="delivery_date">Pickup Date</Label>
              <Input
                type="date"
                name="delivery_date"
                id="delivery_date"
                onChange={handleChange}
              ></Input>
            </div>
          </div>

          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">Where</h3>
            <div className="grid grid-cols-2 gap-3">
              <Label htmlFor="origin_city">Origin City</Label>
              <Input
                name="origin_city"
                id="origin_city"
                onChange={handleChange}
              ></Input>
              <Label htmlFor="origin_state">Origin State</Label>
              <Input
                name="origin_state"
                id="origin_state"
                onChange={handleChange}
              ></Input>
              <Select
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    origin_market_id: value,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Origin market" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {markets.map((market) => (
                      <SelectItem
                        key={market.market_id}
                        value={market.market_id}
                      >
                        {market.market_name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Label htmlFor="destination_city">Destination City</Label>
              <Input
                name="destination_city"
                id="destination_city"
                onChange={handleChange}
              ></Input>
              <Label htmlFor="destination_state">Destination State</Label>
              <Input
                name="destination_state"
                id="destination_state"
                onChange={handleChange}
              ></Input>
              <Select
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    destination_market_id: value,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Destination market" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {markets.map((market) => (
                      <SelectItem
                        key={market.market_id}
                        value={market.market_id}
                      >
                        {market.market_name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">What</h3>
            <div className="grid grid-cols-2 gap-3">
              <Label htmlFor="shipper_name">Shipper Name</Label>
              <Input
                name="shipper_name"
                id="shipper_name"
                onChange={handleChange}
              ></Input>
              <Label htmlFor="receiver_name">Receiver Name</Label>
              <Input
                name="receiver_name"
                id="receiver_name"
                onChange={handleChange}
              ></Input>
              <Label htmlFor="commodity">Commodity</Label>
              <Input
                name="commodity"
                id="commodity"
                onChange={handleChange}
              ></Input>
              <Label htmlFor="weight">Weight</Label>
              <Input
                type="number"
                name="weight"
                id="weight"
                onChange={handleChange}
              ></Input>
              <Label htmlFor="dimensions">Dimensions</Label>
              <Input
                name="dimensions"
                id="dimensions"
                placeholder="8.5' x 13.5' x 73'"
                onChange={handleChange}
              ></Input>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateLoadForm;
