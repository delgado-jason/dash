import { useState, useEffect } from "react";
import type { Broker } from "@/types/broker";
import type { Agent } from "@/types/agent";
import type { Market } from "@/types/market";
import type { LoadInput } from "@/types/LoadInput";
import type { Truck } from "@/types/truck";
import type { Driver } from "@/types/driver";
import type { Trailer } from "@/types/trailer";
import { getTrucks } from "@/services/trucksService";
import { getDrivers } from "@/services/driversService";
import { getTrailers } from "@/services/trailersService";
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

// Interface for LoadFormProps
interface LoadFormProps {
  initialData?: LoadInput;
  mode: "create" | "edit";
  brokers: Broker[];
  agents: Agent[];
  markets: Market[];
  onSuccess: () => void;
  onBrokerCreated: () => void;
  onAgentCreated: () => void;
  onMarketCreated: () => void;
  onClose: () => void;
  onSubmit: (data: LoadInput) => Promise<void>;
}

const LoadForm = ({
  initialData,
  mode,
  brokers,
  agents,
  markets,
  onSuccess,
  onSubmit,
  onBrokerCreated,
  onAgentCreated,
  onMarketCreated,
  onClose,
}: LoadFormProps) => {
  // --- STATE ---
  const [formData, setFormData] = useState<LoadInput>(
    initialData
      ? {
          load_number: initialData.load_number,
          broker_id: initialData.broker_id,
          agent_id: initialData.agent_id,
          load_type: initialData.load_type,
          load_status: initialData.load_status,
          pickup_date: initialData.pickup_date,
          delivery_date: initialData.delivery_date ?? null,
          origin_city: initialData.origin_city,
          origin_state: initialData.origin_state,
          origin_market_id: initialData.origin_market_id,
          destination_city: initialData.destination_city,
          destination_state: initialData.destination_state,
          destination_market_id: initialData.destination_market_id,
          commodity: initialData.commodity,
          weight: initialData.weight ?? null,
          dimensions: initialData.dimensions ?? null,
          shipper_name: initialData.shipper_name ?? null,
          shipper_in: initialData.shipper_in ?? null,
          shipper_out: initialData.shipper_out ?? null,
          receiver_name: initialData.receiver_name ?? null,
          receiver_in: initialData.receiver_in ?? null,
          receiver_out: initialData.receiver_out ?? null,
          linehaul: Number(initialData.linehaul),
          fuel_surcharge: Number(initialData.fuel_surcharge),
          deadhead_miles: initialData.deadhead_miles,
          loaded_miles: initialData.loaded_miles,
          odometer_start: initialData.odometer_start ?? null,
          odometer_end: initialData.odometer_end ?? null,
          payment_status: initialData.payment_status,
          truck_id: initialData.truck_id ?? null,
          driver_id: initialData.driver_id ?? null,
          trailer_id: initialData.trailer_id ?? null,
        }
      : {
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
          shipper_in: null,
          shipper_out: null,
          receiver_name: null,
          receiver_in: null,
          receiver_out: null,
          linehaul: 0,
          fuel_surcharge: 0,
          deadhead_miles: null,
          loaded_miles: null,
          odometer_start: null,
          odometer_end: null,
          payment_status: "unpaid",
          truck_id: null,
          driver_id: null,
          trailer_id: null,
        },
  );

  const [brokerList, setBrokerList] = useState<Broker[]>(brokers);
  const [agentList, setAgentList] = useState<Agent[]>(agents);
  const [marketList, setMarketList] = useState<Market[]>(markets);

  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trailers, setTrailers] = useState<Trailer[]>([]);

  const [error, setError] = useState<string | null>(null);

  // Load the fleet and auto-assign the sole rig when there's only one — no
  // picker needed. Anything already chosen (edit mode) is left untouched.
  useEffect(() => {
    let active = true;
    Promise.all([getTrucks(), getDrivers(), getTrailers()])
      .then(([t, d, tr]) => {
        if (!active) return;
        setTrucks(t);
        setDrivers(d);
        setTrailers(tr);
        setFormData((prev) => ({
          ...prev,
          truck_id: prev.truck_id || (t.length === 1 ? t[0].truck_id : null),
          driver_id: prev.driver_id || (d.length === 1 ? d[0].driver_id : null),
          trailer_id:
            prev.trailer_id || (tr.length === 1 ? tr[0].trailer_id : null),
        }));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

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
      await onSubmit(formData);
      onSuccess();
      onClose();
    } catch (e) {
      setError("Unable to create a new load");
    }
  };

  const truckOptions = trucks.map((t) => ({
    id: t.truck_id,
    name: `Unit ${t.unit_number}`,
  }));
  const driverOptions = drivers.map((d) => ({
    id: d.driver_id,
    name: `${d.first_name} ${d.last_name}`,
  }));
  const trailerOptions = trailers.map((t) => ({
    id: t.trailer_id,
    name: `Unit ${t.unit_number}`,
  }));

  // Single rig → read-only auto-assigned line; multiple → a picker; none → hint.
  const fleetField = (
    label: string,
    value: string | null,
    options: { id: string; name: string }[],
    onChange: (id: string) => void,
  ) => (
    <div>
      <Label>{label}</Label>
      {options.length === 0 ? (
        <p className="text-sm text-muted-text mt-2">None added yet</p>
      ) : options.length === 1 ? (
        <p className="text-sm mt-2">
          {options[0].name}
          <span className="text-muted-text text-xs"> · auto-assigned</span>
        </p>
      ) : (
        <Select value={value ?? ""} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder={`Select a ${label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}
    </div>
  );

  // ---- JSX ----
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">
          {mode === "create" ? "Create Load" : "Edit Load"}
        </h2>
        <button
          onClick={onClose}
          className="text-muted-text hover:text-light"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div>
        {/* ---- IDENTIFICATION ---- */}
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-2">Identification</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Load number field */}
            <div>
              <Label htmlFor="load_number">Load Number</Label>
              <Input
                name="load_number"
                id="load_number"
                onChange={handleChange}
                value={formData.load_number}
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
                value={formData.load_type}
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
                  value={formData.broker_id}
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
                  value={formData.agent_id}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <p className="text-destructive text-sm mt-2">{brokerFormError}</p>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <p className="text-destructive text-sm mt-2">{agentFormError}</p>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Pickup Date field */}
            <div>
              <Label htmlFor="pickup_date">Pickup Date</Label>
              <Input
                type="date"
                name="pickup_date"
                id="pickup_date"
                onChange={handleChange}
                value={formData.pickup_date}
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
                value={formData.delivery_date ?? ""}
              />
            </div>
          </div>
        </div>
        {/* ---- WHERE ---- */}
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-2">Where</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Origin City field */}
            <div>
              <Label htmlFor="origin_city">Origin City</Label>
              <Input
                name="origin_city"
                id="origin_city"
                onChange={handleChange}
                value={formData.origin_city}
              ></Input>
            </div>
            {/* Origin State field name */}
            <div>
              <Label htmlFor="origin_state">Origin State</Label>
              <Input
                name="origin_state"
                id="origin_state"
                onChange={handleChange}
                value={formData.origin_state}
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
                  value={formData.origin_market_id}
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
                value={formData.destination_city}
              ></Input>
            </div>
            {/* Destination State field */}
            <div>
              <Label htmlFor="destination_state">Destination State</Label>
              <Input
                name="destination_state"
                id="destination_state"
                onChange={handleChange}
                value={formData.destination_state}
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
                  value={formData.destination_market_id}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <p className="text-destructive text-sm mt-2">{marketFormError}</p>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="shipper_name">Shipper Name</Label>
              <Input
                name="shipper_name"
                id="shipper_name"
                onChange={handleChange}
                value={formData.shipper_name ?? ""}
              ></Input>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <Label htmlFor="shipper_in">Shipper In</Label>
                  <Input
                    type="time"
                    name="shipper_in"
                    id="shipper_in"
                    value={(formData.shipper_in ?? "").slice(0, 5)}
                    onChange={(e) =>
                      setFormData({ ...formData, shipper_in: e.target.value || null })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="shipper_out">Shipper Out</Label>
                  <Input
                    type="time"
                    name="shipper_out"
                    id="shipper_out"
                    value={(formData.shipper_out ?? "").slice(0, 5)}
                    onChange={(e) =>
                      setFormData({ ...formData, shipper_out: e.target.value || null })
                    }
                  />
                </div>
              </div>
            </div>
            <div>
              <Label htmlFor="receiver_name">Receiver Name</Label>
              <Input
                name="receiver_name"
                id="receiver_name"
                onChange={handleChange}
                value={formData.receiver_name ?? ""}
              ></Input>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <Label htmlFor="receiver_in">Receiver In</Label>
                  <Input
                    type="time"
                    name="receiver_in"
                    id="receiver_in"
                    value={(formData.receiver_in ?? "").slice(0, 5)}
                    onChange={(e) =>
                      setFormData({ ...formData, receiver_in: e.target.value || null })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="receiver_out">Receiver Out</Label>
                  <Input
                    type="time"
                    name="receiver_out"
                    id="receiver_out"
                    value={(formData.receiver_out ?? "").slice(0, 5)}
                    onChange={(e) =>
                      setFormData({ ...formData, receiver_out: e.target.value || null })
                    }
                  />
                </div>
              </div>
            </div>
            <div>
              <Label htmlFor="commodity">Commodity</Label>
              <Input
                name="commodity"
                id="commodity"
                onChange={handleChange}
                value={formData.commodity ?? ""}
              ></Input>
            </div>
            <div>
              <Label htmlFor="weight">Weight</Label>
              <Input
                type="number"
                name="weight"
                id="weight"
                onChange={handleChange}
                value={formData.weight ?? ""}
              ></Input>
            </div>
            <div className="col-span-2">
              <Label htmlFor="dimensions">Dimensions</Label>
              <Input
                name="dimensions"
                id="dimensions"
                placeholder="8.5' x 13.5' x 73'"
                onChange={handleChange}
                value={formData.dimensions ?? ""}
              ></Input>
            </div>
          </div>
        </div>
        {/* ---- REVENUE ---- */}
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-2">Revenue</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="linehaul">Linehaul</Label>
              <Input
                type="number"
                name="linehaul"
                id="linehaul"
                onChange={handleChange}
                value={formData.linehaul}
              ></Input>
            </div>
            <div>
              <Label htmlFor="fuel_surcharge">Fuel Surcharge</Label>
              <Input
                type="number"
                name="fuel_surcharge"
                id="fuel_surcharge"
                onChange={handleChange}
                value={formData.fuel_surcharge}
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
                value={formData.payment_status}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Payment Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                    <SelectItem value="invoiced">Invoiced</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        {/* ---- MILEAGE ---- */}
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-2">Mileage</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="loaded_miles">Loaded Miles</Label>
              <Input
                type="number"
                name="loaded_miles"
                id="loaded_miles"
                onChange={handleChange}
                value={formData.loaded_miles ?? ""}
              ></Input>
            </div>
            <div>
              <Label htmlFor="deadhead_miles">Deadhead Miles</Label>
              <Input
                type="number"
                name="deadhead_miles"
                id="deadhead_miles"
                onChange={handleChange}
                value={formData.deadhead_miles ?? ""}
              ></Input>
            </div>
            <div>
              <Label htmlFor="odometer_start">Odometer Start</Label>
              <Input
                type="number"
                name="odometer_start"
                id="odometer_start"
                onChange={handleChange}
                value={formData.odometer_start ?? ""}
              ></Input>
            </div>
            <div>
              <Label htmlFor="odometer_end">Odometer End</Label>
              <Input
                type="number"
                name="odometer_end"
                id="odometer_end"
                onChange={handleChange}
                value={formData.odometer_end ?? ""}
              ></Input>
            </div>
          </div>
        </div>
        {/* ---- FLEET ---- */}
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-2">Fleet</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {fleetField(
              "Truck",
              formData.truck_id ?? null,
              truckOptions,
              (id) => setFormData({ ...formData, truck_id: id }),
            )}
            {fleetField(
              "Driver",
              formData.driver_id ?? null,
              driverOptions,
              (id) => setFormData({ ...formData, driver_id: id }),
            )}
            {fleetField(
              "Trailer",
              formData.trailer_id ?? null,
              trailerOptions,
              (id) => setFormData({ ...formData, trailer_id: id }),
            )}
          </div>
        </div>
        {error && <p className="text-destructive text-sm mt-3">{error}</p>}
        <Button className="mt-4" onClick={handleSubmit}>
          {mode === "create" ? "Create Load" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
};

export default LoadForm;
