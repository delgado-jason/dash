import { useState } from "react";
import { useAgent } from "@/hooks/useAgent";

// Components
import { RatingDisplay } from "@/components/RatingDisplay";
import RatingForm from "@/components/RatingForm";
import { Button } from "@/components/ui/button";

// Icons
import { Mail } from "lucide-react";
import { Phone } from "lucide-react";

const AgentDetailPage = () => {
  // ---- REACT STATE ----
  const [refreshKey, setRefreshKey] = useState(0);
  const [showRatingForm, setShowRatingForm] = useState(false);
  const { agent, isLoading, error } = useAgent(refreshKey);

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
      <div className="grid grid-cols-4 bg-plate">
        {/* Main Content Area */}
        <div className="col-span-3">Main content</div>
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
