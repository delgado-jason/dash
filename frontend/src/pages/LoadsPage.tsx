import { useState } from "react";
import { Link } from "react-router";

import { useLoads } from "@/hooks/useLoads";
import { useBrokers } from "@/hooks/useBrokers";
import { useAgents } from "@/hooks/useAgents";
import { useMarkets } from "@/hooks/useMarkets";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import LoadForm from "../components/LoadForm";
import { Button } from "@/components/ui/button";
import { createLoad } from "@/services/createLoadService";

const LoadsPage = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [brokerRefreshKey, setBrokerRefreshKey] = useState(0);
  const [agentRefreshKey, setAgentRefreshKey] = useState(0);
  const [marketRefreshKey, setMarketRefreshKey] = useState(0);
  const { brokers } = useBrokers(brokerRefreshKey);

  const { loads, isLoading, error } = useLoads(refreshKey);
  const { agents } = useAgents(agentRefreshKey);
  const { markets } = useMarkets(marketRefreshKey);

  const [showCreateForm, setShowCreateForm] = useState(false);

  const handleLoadCreated = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const handleBrokerRefresh = () => {
    setBrokerRefreshKey((prev) => prev + 1);
  };

  const handleAgentRefresh = () => {
    setAgentRefreshKey((prev) => prev + 1);
  };

  const handleMarketRefresh = () => {
    setMarketRefreshKey((prev) => prev + 1);
  };

  if (isLoading) {
    return (
      <div>
        <p>Loading...</p>
      </div>
    );
  }

  if (error !== null) {
    return (
      <div>
        <p>{error}</p>
      </div>
    );
  }
  return (
    <div>
      {/* Overlay */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowCreateForm(false)}
          />
          <div className="relative w-[750px] max-h-[90vh] bg-white overflow-y-auto shadow-xl rounded-lg p-6">
            <LoadForm
              mode="create"
              brokers={brokers}
              agents={agents}
              markets={markets}
              onSubmit={async (data) => {
                await createLoad(data);
              }}
              onSuccess={handleLoadCreated}
              onBrokerCreated={handleBrokerRefresh}
              onAgentCreated={handleAgentRefresh}
              onMarketCreated={handleMarketRefresh}
              onClose={() => setShowCreateForm(false)}
            />
          </div>
        </div>
      )}

      <Button onClick={() => setShowCreateForm(true)}>Create Load</Button>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Load #</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Broker</TableHead>
            <TableHead>Origin</TableHead>
            <TableHead>Destination</TableHead>
            <TableHead>Pickup Date</TableHead>
            <TableHead>Linehaul</TableHead>
            <TableHead>Payment Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loads.map((load) => (
            <TableRow key={load.load_id}>
              <TableCell className="text-blue-600 hover:underline cursor-pointer">
                <Link to={`/loads/${load.load_id}`}>{load.load_number}</Link>
              </TableCell>
              <TableCell>{load.load_status}</TableCell>
              <TableCell>{load.broker}</TableCell>
              <TableCell>
                {load.origin_city + ", " + load.origin_state}
              </TableCell>
              <TableCell>
                {load.destination_city + ", " + load.destination_state}
              </TableCell>
              <TableCell>
                {new Date(load.pickup_date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </TableCell>
              <TableCell>
                {Number(load.linehaul).toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                })}
              </TableCell>
              <TableCell>{load.payment_status}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default LoadsPage;
