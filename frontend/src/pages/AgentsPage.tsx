import { useState } from "react";
import { useAgents } from "@/hooks/useAgents";
import { Link } from "react-router";

// Types
import type { Agent } from "@/types/agent";

// UI Components
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

// App Components
import RatingForm from "@/components/RatingForm";

const AgentsPage = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [showRatingForm, setShowRatingForm] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  const { agents, isLoading, error } = useAgents(refreshKey);

  if (isLoading) return <div>Loading agents...</div>;

  if (error) return <div>{error}</div>;

  // ---- HANDLERS ----

  const handleRatingSuccess = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <>
      {showRatingForm && selectedAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowRatingForm(false)}
          />
          <div className="relative w-[750px] max-h-[90vh] bg-card text-foreground overflow-y-auto shadow-xl rounded-lg p-6">
            <RatingForm
              agent={selectedAgent}
              onSuccess={handleRatingSuccess}
              onClose={() => setShowRatingForm(false)}
            />
          </div>
        </div>
      )}
      <div>
        <div className="bg-iron mt-4 p-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Edit Rating</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((agent) => (
                <TableRow key={agent.agent_id}>
                  <TableCell className="text-foreground hover:text-primary hover:underline cursor-pointer">
                    <Link to={`/agents/${agent.agent_id}`}>
                      {agent.first_name + " " + agent.last_name}
                    </Link>
                  </TableCell>
                  <TableCell>{agent.rating}</TableCell>
                  <TableCell>
                    <Button
                      onClick={() => {
                        setSelectedAgent(agent);
                        setShowRatingForm(true);
                      }}
                    >
                      Edit Rating
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
};

export default AgentsPage;
