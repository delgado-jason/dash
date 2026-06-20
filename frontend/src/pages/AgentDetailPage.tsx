import { useState } from "react";
import { useAgent } from "@/hooks/useAgent";

// Components
import { RatingDisplay } from "@/components/RatingDisplay";
import RatingForm from "@/components/RatingForm";
import { Button } from "@/components/ui/button";
import { MetricStrip } from "@/components/MetricStrip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { Link } from "react-router";

// Helpers
import {
  getLoadCount,
  getAverageRPM,
  getCancelledCount,
  getGrossRevenue,
  getLastLoadDate,
} from "@/lib/metrics/agent";

// Icons
import { Mail } from "lucide-react";
import { Phone } from "lucide-react";

const AgentDetailPage = () => {
  // ---- REACT STATE ----
  const [refreshKey, setRefreshKey] = useState(0);
  const [showRatingForm, setShowRatingForm] = useState(false);
  const { agent, loads, isLoading, error } = useAgent(refreshKey);

  if (!agent) {
    return (
      <div>
        <p>No agent found</p>
      </div>
    );
  }

  if (isLoading)
    return (
      <div>
        <p>...Loading agent</p>
      </div>
    );

  if (error)
    return (
      <div>
        <p>{error}</p>
      </div>
    );

  // ---- HANDLERS ----
  const handleEditRating = () => {
    setShowRatingForm(true);
  };

  const handleSuccess = () => {
    setRefreshKey((prev) => prev + 1);
    setShowRatingForm(false);
  };

  return (
    <>
      {/* Modal */}
      {showRatingForm && agent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowRatingForm(false)}
          />
          <div className="relative w-[450px] max-h-[90vh] bg-card text-foreground overflow-y-auto shadow-xl rounded-lg p-6">
            <RatingForm
              agent={agent}
              onSuccess={handleSuccess}
              onClose={() => setShowRatingForm(false)}
            />
          </div>
        </div>
      )}
      <div className="p-6 bg-iron text-light font-body">
        <div className="flex justify-between">
          {/* Left side of header */}
          <div>
            <div className="flex gap-4">
              <div className="flex rounded-full items-center bg-steel justify-center size-20 text-4xl font-display text-light">
                {agent.first_name.charAt(0)} {agent.last_name.charAt(0)}
              </div>
              <div className="text-4xl text-light font-condensed">
                {agent.first_name + " " + agent.last_name}
                <p className="text-xl text-muted-text">
                  {agent.broker_name} · Landstar Agent
                </p>
              </div>
            </div>
            <RatingDisplay rating={agent.rating} />
          </div>
          {/* Right side of header */}
          <div>
            <Button onClick={handleEditRating}>Edit Rating</Button>
          </div>
        </div>
      </div>
      <div className="bg-iron pl-4">
        <MetricStrip
          cards={[
            {
              label: "Loads",
              value: getLoadCount(loads),
              format: "number",
            },
            {
              label: "Gross Revenue",
              value: getGrossRevenue(loads),
              format: "currency",
            },
            {
              label: "Average RPM",
              value: getAverageRPM(loads),
              format: "currency",
            },
            {
              label: "Cancelled",
              value: getCancelledCount(loads),
              format: "number",
            },
            {
              label: "Last Worked",
              value: getLastLoadDate(loads)
                ? new Date(getLastLoadDate(loads)!).toLocaleDateString(
                    "en-US",
                    {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      timeZone: "UTC",
                    },
                  )
                : "Never",
              format: "string",
            },
          ]}
        />
      </div>
      <div className="grid grid-cols-4 bg-plate">
        {/* Main Content Area */}
        <div className="col-span-3">
          <div className="bg-plate p-2 m-2 text-xs">
            <h3 className="text-lg text-muted-text uppercase tracking-wider font-condensed bg-plate">
              Loads Run with this agent
            </h3>
            <div className="bg-steel text-xs">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead>Load #</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Origin</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Pickup Date</TableHead>
                    <TableHead>Delivery Date</TableHead>
                    <TableHead>Gross Revenue</TableHead>
                    <TableHead>Payment Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loads.map((load) => (
                    <TableRow
                      key={load.load_id}
                      className={
                        load.load_status === "in_transit"
                          ? "border-l-4 border-l-primary"
                          : ""
                      }
                    >
                      <TableCell className="text-foreground hover:text-primary hover:underline cursor-pointer">
                        <Link to={`/loads/${load.load_id}`}>
                          {load.load_number}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusBadge value={load.load_status} />
                      </TableCell>
                      <TableCell>
                        {load.origin_city + ", " + load.origin_state}
                      </TableCell>
                      <TableCell>
                        {load.destination_city + ", " + load.destination_state}
                      </TableCell>
                      <TableCell>
                        {new Date(load.pickup_date).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            timeZone: "UTC",
                          },
                        )}
                      </TableCell>
                      <TableCell>
                        {load.delivery_date
                          ? new Date(load.delivery_date).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                timeZone: "UTC",
                              },
                            )
                          : "-"}
                      </TableCell>
                      <TableCell>
                        {(
                          Number(load.linehaul) +
                          Number(load.fuel_surcharge) +
                          Number(load.total_accessorials)
                        ).toLocaleString("en-US", {
                          style: "currency",
                          currency: "USD",
                        })}
                      </TableCell>
                      <TableCell>
                        <StatusBadge value={load.payment_status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
        {/* Sidebar Area */}
        <div className="col-span-1 bg-plate p-4 border-l-1 border-iron text-foreground">
          <h2 className="text-md mt-2 mb-2 uppercase text-muted-text tracking-wider">
            Contact
          </h2>
          <p className="text-sm text-muted-text mb-4">
            <Mail size="16px" />{" "}
            <span className="text-foreground">
              {agent.email ? agent.email : "No email provided"}
            </span>
          </p>
          <p className="text-sm text-muted-text mb-4">
            <Phone size="16px" />{" "}
            <span className="text-foreground">
              {agent.phone ? agent.phone : "No phone number provided"}
            </span>
          </p>
          <p className="text-sm text-muted-text">Preferred Method</p>
          <p className="text-sm text-foreground capitalize">
            {agent.preferred_contact}
          </p>
        </div>
      </div>
    </>
  );
};

export default AgentDetailPage;
