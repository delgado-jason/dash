import { useState } from "react";
import { useAgent } from "@/hooks/useAgent";

// Components
import { RatingDisplay } from "@/components/RatingDisplay";
import RatingForm from "@/components/RatingForm";
import { Button } from "@/components/ui/button";

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
    </>
  );
};

export default AgentDetailPage;
