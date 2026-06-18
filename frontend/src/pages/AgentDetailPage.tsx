import { useState } from "react";
import { useAgent } from "@/hooks/useAgent";

const AgentDetailPage = () => {
  // ---- REACT STATE ----
  const [refreshKey, setRefreshKey] = useState(0);
  const { agent, isLoading, error } = useAgent(refreshKey);
  console.log(agent);

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

  return (
    <div>
      <p>{agent.first_name}</p>
    </div>
  );
};

export default AgentDetailPage;
