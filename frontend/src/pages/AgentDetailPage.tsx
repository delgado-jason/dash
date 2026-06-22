import { useState } from "react";
import { useAgent } from "@/hooks/useAgent";

import { createAgentNote } from "@/services/createAgentNoteService";

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
import { StickyNote } from "lucide-react";
import { Star } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

// Helpers
import {
  getLoadCount,
  getAverageRPM,
  getCancelledCount,
  getGrossRevenue,
  getLastLoadDate,
} from "@/lib/metrics/agent";
import { buildTimeline } from "@/lib/metrics/agent";

// Icons
import { Mail } from "lucide-react";
import { Phone } from "lucide-react";

const AgentDetailPage = () => {
  // ---- REACT STATE ----
  const [refreshKey, setRefreshKey] = useState(0);
  const [showRatingForm, setShowRatingForm] = useState(false);
  const { agent, loads, notes, ratingHistory, isLoading, error } =
    useAgent(refreshKey);

  // ---- NOTE COMPOSER STATE ----
  const [noteText, setNoteText] = useState("");
  const [noteInitials, setNoteInitials] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);

  const logs = buildTimeline(notes, ratingHistory);

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

  const handleAddNote = async () => {
    setNoteError(null);

    if (!noteText.trim() || !noteInitials.trim()) {
      setNoteError("A note and your initials are required");
      return;
    }

    if (!agent) return; // agent is in scope; guard for TS

    try {
      setSavingNote(true);
      await createAgentNote(agent.agent_id, {
        note: noteText.trim(),
        created_by: noteInitials.trim(),
      });
      setNoteText("");
      setNoteInitials("");
      setRefreshKey((prev) => prev + 1); // refetch → new note appears in timeline
    } catch (e) {
      setNoteError(e instanceof Error ? e.message : "Failed to add note");
    } finally {
      setSavingNote(false);
    }
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
            {/* ACTIVITY TIMELINE */}
            <div className="bg-plate p-2 m-2">
              <h3 className="text-lg text-muted-text uppercase tracking-wider font-condensed mb-3">
                Activity
              </h3>
              {/* Note composer */}
              <div className="bg-steel/30 rounded-sm p-3 mb-4 flex flex-col gap-2">
                <Textarea
                  placeholder="Add a note about this agent..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  className="text-sm"
                />
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Initials"
                    maxLength={5}
                    value={noteInitials}
                    onChange={(e) => setNoteInitials(e.target.value)}
                    className="w-24 text-sm"
                  />
                  <Button
                    onClick={handleAddNote}
                    disabled={savingNote}
                    className="ml-auto"
                  >
                    {savingNote ? "Saving..." : "Add Note"}
                  </Button>
                </div>
                {noteError && (
                  <p className="text-destructive text-sm">{noteError}</p>
                )}
              </div>
              {logs.length === 0 ? (
                <p className="text-sm text-muted-text italic px-2 py-4">
                  No activity yet
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {logs.map((log) => {
                    const date = new Date(log.timestamp).toLocaleDateString(
                      "en-US",
                      {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        timeZone: "UTC",
                      },
                    );

                    if (log.type === "rating") {
                      return (
                        <div
                          key={log.data.id}
                          className="flex gap-3 items-start border-l-2 border-l-primary bg-steel/40 px-3 py-2 rounded-sm"
                        >
                          <Star
                            size={14}
                            className="text-primary mt-1 shrink-0"
                            fill="var(--color-primary)"
                          />
                          <div className="text-sm">
                            <p className="text-foreground">
                              Rating changed{" "}
                              <span className="text-muted-text">
                                {log.data.old_rating ?? "—"}
                              </span>{" "}
                              →{" "}
                              <span className="text-primary font-semibold">
                                {log.data.new_rating}
                              </span>
                            </p>
                            <p className="text-muted-text">{log.data.reason}</p>
                            <p className="text-xs text-muted-text mt-1">
                              {date} · {log.data.changed_by}
                            </p>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={log.data.id}
                        className="flex gap-3 items-start border-l-2 border-l-iron bg-steel/20 px-3 py-2 rounded-sm"
                      >
                        <StickyNote
                          size={14}
                          className="text-muted-text mt-1 shrink-0"
                        />
                        <div className="text-sm">
                          <p className="text-foreground">{log.data.note}</p>
                          <p className="text-xs text-muted-text mt-1">
                            {date} · {log.data.created_by}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
