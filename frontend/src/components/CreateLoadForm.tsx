import { useState } from "react";
import type { Broker } from "@/types/broker";
import type { Agent } from "@/types/agent";
import type { Market } from "@/types/market";
import type { CreateLoadInput } from "@/types/createLoadInput";

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
  return <></>;
};

export default CreateLoadForm;
