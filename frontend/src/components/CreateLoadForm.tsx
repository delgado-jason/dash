import { useState } from "react";
import type { Broker } from "@/types/broker";
import type { Agent } from "@/types/agent";
import type { Market } from "@/types/market";
import type { CreateLoadInput } from "@/types/createLoadInput";
import { QuickAddBroker } from "./QuickAddBroker";
import { QuickAddAgent } from "./QuickAddAgent";
import { QuickAddMarket } from "./QuickAddMarket";

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
  // --- STATE ---
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
    odometer_start: null,
    payment_status: "unpaid",
  });

  const [brokerList, setBrokerList] = useState<Broker[]>(brokers);
  const [agentList, setAgentList] = useState<Agent[]>(agents);
  const [marketList, setMarketList] = useState<Market[]>(markets);

  // Filters agents to the broker
  const filteredAgents = agentList.filter(
    (agent) => agent.broker_id === formData.broker_id,
  );

  // ---- HANDLERS ----
  const handleBrokerCreated = (newBroker: Broker) => {
    setBrokerList([...brokerList, newBroker]);
    setFormData({ ...formData, broker_id: newBroker.broker_id, agent_id: "" });
  };

  const handleAgentCreated = (newAgent: Agent) => {
    setAgentList([...agentList, newAgent]);
    setFormData({ ...formData, agent_id: newAgent.agent_id });
  };

  const handleMarketCreated = (
    newMarket: Market,
    fieldName: "origin_market_id" | "destination_market_id",
  ) => {
    setMarketList([...marketList, newMarket]);
    setFormData({ ...formData, [fieldName]: newMarket.market_id });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  // ---- JSX ----
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open Dialog</Button>
      </DialogTrigger>
      <DialogContent className="overflow-y-auto max-h-[80vh] sm:max-w-3xl">
        <div>
          <DialogHeader>
            <DialogTitle>Create Load</DialogTitle>
            <DialogDescription className="sr-only">
              Create a new load
            </DialogDescription>
          </DialogHeader>
          {/* ---- IDENTIFICATION ---- */}
          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">Identification</h3>
            <div className="grid grid-cols-2 gap-3">
              {/* Load number field */}
              <div>
                <Label htmlFor="load_number">Load Number</Label>
                <Input
                  name="load_number"
                  id="load_number"
                  onChange={handleChange}
                ></Input>
              </div>
              {/* Load type field */}
              <div>
                <Label htmlFor="load_type">Load Type</Label>
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
              {/* Broker selects */}
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label htmlFor="broker">Broker</Label>
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
                        {brokerList.map((broker) => (
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
                </div>
                <QuickAddBroker
                  onSuccess={handleBrokerCreated}
                  onCancel={() => {}}
                />
              </div>
              {/* Agent selects */}
              <div className="flex flex-2 items-end">
                <div className="flex-1">
                  <Label htmlFor="agent">Agent</Label>
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
                          <SelectItem
                            key={agent.agent_id}
                            value={agent.agent_id}
                          >
                            {agent.first_name + " " + agent.last_name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <QuickAddAgent
                  brokers={brokers}
                  onSuccess={handleAgentCreated}
                  onCancel={() => {}}
                />
              </div>
            </div>
          </div>
          {/* ---- WHEN ---- */}
          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">When</h3>
            <div className="grid grid-cols-2 gap-3">
              {/* Pickup Date field */}
              <div>
                <Label htmlFor="pickup_date">Pickup Date</Label>
                <Input
                  type="date"
                  name="pickup_date"
                  id="pickup_date"
                  onChange={handleChange}
                />
              </div>
              {/* Delivery Date field */}
              <div>
                <Label htmlFor="delivery_date">Delivery Date</Label>
                <Input
                  type="date"
                  name="delivery_date"
                  id="delivery_date"
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>
          {/* ---- WHERE ---- */}
          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">Where</h3>
            <div className="grid grid-cols-3 gap-3">
              {/* Origin City field */}
              <div>
                <Label htmlFor="origin_city">Origin City</Label>
                <Input
                  name="origin_city"
                  id="origin_city"
                  onChange={handleChange}
                ></Input>
              </div>
              {/* Origin State field name */}
              <div>
                <Label htmlFor="origin_state">Origin State</Label>
                <Input
                  name="origin_state"
                  id="origin_state"
                  onChange={handleChange}
                ></Input>
              </div>
              {/* Origin Market selects */}
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label htmlFor="origin_market">Origin Market</Label>
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
                        {marketList.map((market) => (
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
                <QuickAddMarket
                  fieldName="origin_market_id"
                  onSuccess={handleMarketCreated}
                  onCancel={() => {}}
                />
              </div>
              {/* end of origin fields */}
              {/* Destination City field */}
              <div>
                <Label htmlFor="destination_city">Destination City</Label>
                <Input
                  name="destination_city"
                  id="destination_city"
                  onChange={handleChange}
                ></Input>
              </div>
              {/* Destination State field */}
              <div>
                <Label htmlFor="destination_state">Destination State</Label>
                <Input
                  name="destination_state"
                  id="destination_state"
                  onChange={handleChange}
                ></Input>
              </div>
              {/* Destination Market selects */}
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label htmlFor="destination_market">Destination Market</Label>
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
                        {marketList.map((market) => (
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
                <QuickAddMarket
                  fieldName="destination_market_id"
                  onSuccess={handleMarketCreated}
                  onCancel={() => {}}
                />
              </div>
            </div>
          </div>
          {/* ---- WHAT ---- */}
          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">What</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="shipper_name">Shipper Name</Label>
                <Input
                  name="shipper_name"
                  id="shipper_name"
                  onChange={handleChange}
                ></Input>
              </div>
              <div>
                <Label htmlFor="receiver_name">Receiver Name</Label>
                <Input
                  name="receiver_name"
                  id="receiver_name"
                  onChange={handleChange}
                ></Input>
              </div>
              <div>
                <Label htmlFor="commodity">Commodity</Label>
                <Input
                  name="commodity"
                  id="commodity"
                  onChange={handleChange}
                ></Input>
              </div>
              <div>
                <Label htmlFor="weight">Weight</Label>
                <Input
                  type="number"
                  name="weight"
                  id="weight"
                  onChange={handleChange}
                ></Input>
              </div>
              <div className="col-span-2">
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
          {/* ---- REVENUE ---- */}
          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">Revenue</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="linehaul">Linehaul</Label>
                <Input
                  name="linehaul"
                  id="linehaul"
                  onChange={handleChange}
                ></Input>
              </div>
              <div>
                <Label htmlFor="fuel_surcharge">Fuel Surcharge</Label>
                <Input
                  name="fuel_surcharge"
                  id="fuel_surcharge"
                  onChange={handleChange}
                ></Input>
              </div>
              <div>
                <Label htmlFor="payment_status">Payment Status</Label>
                <Select
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      payment_status: value,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Payment Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="unpaid">Unpaid</SelectItem>
                      <SelectItem value="invoiced">Invoiced</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          {/* ---- MILEAGE ---- */}
          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">Mileage</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="loaded_miles">Loaded Miles</Label>
                <Input
                  type="number"
                  name="loaded_miles"
                  id="loaded_miles"
                  onChange={handleChange}
                ></Input>
              </div>
              <div>
                <Label htmlFor="deadhead_miles">Deadhead Miles</Label>
                <Input
                  type="number"
                  name="deadhead_miles"
                  id="deadhead_miles"
                  onChange={handleChange}
                ></Input>
              </div>
              <div>
                <Label htmlFor="odometer_start">Odometer Start</Label>
                <Input
                  type="number"
                  name="odometer_start"
                  id="odometer_start"
                  onChange={handleChange}
                ></Input>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateLoadForm;
