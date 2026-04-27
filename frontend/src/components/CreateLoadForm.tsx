import { useState } from "react";
import type { Broker } from "@/types/broker";
import type { Agent } from "@/types/agent";
import type { Market } from "@/types/market";
import type { CreateLoadInput } from "@/types/createLoadInput";
import { createLoad } from "@/services/createLoadService";
import { QuickAddBroker } from "./QuickAddBroker";
import { QuickAddAgent } from "./QuickAddAgent";
import { QuickAddMarket } from "./QuickAddMarket";

import { Textarea } from "@/components/ui/textarea";
import { createBroker } from "@/services/createBrokerService";
import { createAgent } from "@/services/createAgentService";
import { createMarket } from "@/services/createMarketService";
import type { CreateBrokerInput } from "@/types/createBrokerInput";
import type { CreateAgentInput } from "@/types/createAgentInput";
import type { CreateMarketInput } from "@/types/createMarketInput";

// UI Component Imports

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
  onBrokerCreated: () => void;
  onAgentCreated: () => void;
  onMarketCreated: () => void;
  onClose: () => void;
}

const CreateLoadForm = ({
  brokers,
  agents,
  markets,
  onSuccess,
  onBrokerCreated,
  onAgentCreated,
  onMarketCreated,
  onClose,
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

  const [error, setError] = useState<string | null>(null);

  // Form controll states for brokers, agents, and markets
  const [showBrokerForm, setShowBrokerForm] = useState(false);
  const [newBroker, setNewBroker] = useState<CreateBrokerInput>({
    broker_name: "",
    phone: null,
    email: null,
    rating: null,
    notes: null,
  });
  const [brokerFormError, setBrokerFormError] = useState<string | null>(null);

  const [showAgentForm, setShowAgentForm] = useState(false);
  const [newAgent, setNewAgent] = useState<CreateAgentInput>({
    broker_id: "",
    first_name: "",
    last_name: "",
    phone: null,
    email: null,
    preferred_contact: null,
    rating: null,
    notes: null,
  });
  const [agentFormError, setAgentFormError] = useState<string | null>(null);

  const [showMarketForm, setShowMarketForm] = useState(false);
  const [marketFieldName, setMarketFieldName] = useState<
    "origin_market_id" | "destination_market_id"
  >("origin_market_id");
  const [newMarket, setNewMarket] = useState<CreateMarketInput>({
    market_name: "",
    notes: null,
  });
  const [marketFormError, setMarketFormError] = useState<string | null>(null);

  // Filters agents to the broker
  const filteredAgents = agentList.filter(
    (agent) => agent.broker_id === formData.broker_id,
  );

  // ---- HANDLERS ----
  const handleBrokerCreated = (newBroker: Broker) => {
    setBrokerList([...brokerList, newBroker]);
    setFormData({ ...formData, broker_id: newBroker.broker_id, agent_id: "" });
  };

  const handleCreateBroker = async () => {
    try {
      const created = await createBroker(newBroker);
      handleBrokerCreated(created);
      setShowBrokerForm(false);
      onBrokerCreated();
    } catch {
      setBrokerFormError("Unable to create broker");
    }
  };

  const handleCreateAgent = async () => {
    try {
      console.log(newAgent);
      const created = await createAgent(newAgent);
      handleAgentCreated(created);
      setShowAgentForm(false);
      onAgentCreated();
    } catch {
      setAgentFormError("Unable to create agent");
    }
  };

  const handleCreateMarket = async () => {
    try {
      const created = await createMarket(newMarket);
      handleMarketCreated(created, marketFieldName);
      setShowMarketForm(false);
      onMarketCreated();
    } catch {
      setMarketFormError("Unable to create market");
    }
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
    const value =
      e.target.type === "number" ? Number(e.target.value) : e.target.value;
    setFormData({
      ...formData,
      [e.target.name]: value,
    });
  };

  const handleSubmit = async () => {
    try {
      await createLoad(formData);
      onSuccess();
      onClose();
    } catch (e) {
      setError("Unable to create a new load");
    }
  };

  // ---- JSX ----
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Create Load</h2>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
          ✕
        </button>
      </div>
      <div>
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
              <QuickAddBroker onOpen={() => setShowBrokerForm(true)} />
            </div>
            {/* Agent selects */}
            <div className="flex flex-2 items-end">
              <div className="flex-1">
                <Label htmlFor="agent">Agent</Label>
                <Select
                  disabled={!formData.broker_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, agent_id: value })
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
              </div>
              <QuickAddAgent onOpen={() => setShowAgentForm(true)} />
            </div>
          </div>
          {/* ---- QUICK ADD BROKER FORM ---- */}
          {showBrokerForm && (
            <div className="col-span-2 border rounded p-4 mt-2">
              <h4 className="text-sm font-semibold mb-3">New Broker</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="new_broker_name">Broker Name</Label>
                  <Input
                    name="broker_name"
                    id="new_broker_name"
                    onChange={(e) =>
                      setNewBroker({
                        ...newBroker,
                        broker_name: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="new_broker_phone">Phone</Label>
                  <Input
                    name="phone"
                    id="new_broker_phone"
                    onChange={(e) =>
                      setNewBroker({ ...newBroker, phone: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="new_broker_email">Email</Label>
                  <Input
                    type="email"
                    name="email"
                    id="new_broker_email"
                    onChange={(e) =>
                      setNewBroker({ ...newBroker, email: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Rating</Label>
                  <Select
                    onValueChange={(value) =>
                      setNewBroker({ ...newBroker, rating: Number(value) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a rating" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label htmlFor="new_broker_notes">Notes</Label>
                  <Textarea
                    id="new_broker_notes"
                    onChange={(e) =>
                      setNewBroker({ ...newBroker, notes: e.target.value })
                    }
                  />
                </div>
              </div>
              {brokerFormError && (
                <p className="text-red-500 text-sm mt-2">{brokerFormError}</p>
              )}
              <div className="flex gap-2 mt-3">
                <Button onClick={handleCreateBroker}>Create Broker</Button>
                <Button
                  variant="outline"
                  onClick={() => setShowBrokerForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {/* ---- QUICK ADD AGENT FORM ---- */}
          {showAgentForm && (
            <div className="col-span-2 border rounded p-4 mt-2">
              <h4 className="text-sm font-semibold mb-3">New Agent</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Broker</Label>
                  <Select
                    onValueChange={(value) =>
                      setNewAgent({ ...newAgent, broker_id: value })
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
                <div>
                  <Label htmlFor="new_agent_first_name">First Name</Label>
                  <Input
                    id="new_agent_first_name"
                    onChange={(e) =>
                      setNewAgent({ ...newAgent, first_name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="new_agent_last_name">Last Name</Label>
                  <Input
                    id="new_agent_last_name"
                    onChange={(e) =>
                      setNewAgent({ ...newAgent, last_name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="new_agent_phone">Phone</Label>
                  <Input
                    id="new_agent_phone"
                    onChange={(e) =>
                      setNewAgent({ ...newAgent, phone: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="new_agent_email">Email</Label>
                  <Input
                    type="email"
                    id="new_agent_email"
                    onChange={(e) =>
                      setNewAgent({ ...newAgent, email: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Preferred Contact</Label>
                  <Select
                    onValueChange={(value) =>
                      setNewAgent({ ...newAgent, preferred_contact: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select method" />
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
                <div>
                  <Label>Rating</Label>
                  <Select
                    onValueChange={(value) =>
                      setNewAgent({ ...newAgent, rating: Number(value) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a rating" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label htmlFor="new_agent_notes">Notes</Label>
                  <Textarea
                    id="new_agent_notes"
                    onChange={(e) =>
                      setNewAgent({ ...newAgent, notes: e.target.value })
                    }
                  />
                </div>
              </div>
              {agentFormError && (
                <p className="text-red-500 text-sm mt-2">{agentFormError}</p>
              )}
              <div className="flex gap-2 mt-3">
                <Button onClick={handleCreateAgent}>Create Agent</Button>
                <Button
                  variant="outline"
                  onClick={() => setShowAgentForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
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
                onOpen={(field) => {
                  setMarketFieldName(field);
                  setShowMarketForm(true);
                }}
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
                onOpen={(field) => {
                  setMarketFieldName(field);
                  setShowMarketForm(true);
                }}
              />
            </div>
          </div>
          {showMarketForm && (
            <div className="border rounded p-4 mt-2">
              <h4 className="text-sm font-semibold mb-3">New Market</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label htmlFor="new_market_name">Market Name</Label>
                  <Input
                    id="new_market_name"
                    onChange={(e) =>
                      setNewMarket({
                        ...newMarket,
                        market_name: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="new_market_notes">Notes</Label>
                  <Textarea
                    id="new_market_notes"
                    onChange={(e) =>
                      setNewMarket({ ...newMarket, notes: e.target.value })
                    }
                  />
                </div>
              </div>
              {marketFormError && (
                <p className="text-red-500 text-sm mt-2">{marketFormError}</p>
              )}
              <div className="flex gap-2 mt-3">
                <Button onClick={handleCreateMarket}>Create Market</Button>
                <Button
                  variant="outline"
                  onClick={() => setShowMarketForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
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
                type="number"
                name="linehaul"
                id="linehaul"
                onChange={handleChange}
              ></Input>
            </div>
            <div>
              <Label htmlFor="fuel_surcharge">Fuel Surcharge</Label>
              <Input
                type="number"
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
        {error && <p>{error}</p>}
        <Button onClick={handleSubmit}>Create Load</Button>
      </div>
    </div>
  );
};

export default CreateLoadForm;
