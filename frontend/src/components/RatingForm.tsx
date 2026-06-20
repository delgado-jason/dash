import { useState } from "react";
import type { Agent } from "@/types/agent";
import type { AgentPatchPayload } from "@/types/agentPatchPayload";
import { patchAgent } from "@/services/patchAgentService";
import { RATING_OPTIONS } from "@/lib/metrics/ratingLabels";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface RatingFormProps {
  agent: Agent;
  onSuccess: () => void;
  onClose: () => void;
}

const RatingForm = ({ agent, onSuccess, onClose }: RatingFormProps) => {
  // --- STATE ---
  const [rating, setRating] = useState<number | null>(agent.rating ?? null);
  const [reason, setReason] = useState("");
  const [changedBy, setChangedBy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Did the user actually change the rating from its current value?
  const ratingChanged = rating !== (agent.rating ?? null);

  // --- HANDLER ---
  const handleSubmit = async () => {
    setError(null);

    // Client-side guard: a rating change needs a reason + initials.
    // (The backend enforces this too — this is just faster feedback.)
    if (ratingChanged && (!reason.trim() || !changedBy.trim())) {
      setError("Rating changes require a reason and initials");
      return;
    }

    // Nothing to do if the rating didn't change.
    if (!ratingChanged) {
      onClose();
      return;
    }

    const payload: AgentPatchPayload = {
      rating,
      reason: reason.trim(),
      changed_by: changedBy.trim(),
    };

    try {
      setIsSaving(true);
      await patchAgent(agent.agent_id, payload);
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update rating");
    } finally {
      setIsSaving(false);
    }
  };

  // --- JSX ---
  return (
    <div className="font-body">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-foreground">
          Edit Rating —{" "}
          <span className="font-normal text-muted-foreground">
            {agent.first_name} {agent.last_name}
          </span>
        </h2>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="grid gap-4">
        {/* Rating */}
        <div>
          <Label htmlFor="rating">Rating</Label>
          <Select
            value={rating !== null ? String(rating) : undefined}
            onValueChange={(value) => setRating(Number(value))}
          >
            <SelectTrigger id="rating">
              <SelectValue placeholder="Select a rating" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {RATING_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {/* Reason — only meaningful when the rating changes */}
        <div>
          <Label htmlFor="reason">
            Reason {ratingChanged && <span className="text-primary">*</span>}
          </Label>
          <Textarea
            id="reason"
            placeholder="Why is the rating changing?"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        {/* Changed by / initials */}
        <div>
          <Label htmlFor="changed_by">
            Your Initials{" "}
            {ratingChanged && <span className="text-primary">*</span>}
          </Label>
          <Input
            id="changed_by"
            maxLength={5}
            placeholder="e.g. JD"
            value={changedBy}
            onChange={(e) => setChangedBy(e.target.value)}
          />
        </div>

        {/* Error */}
        {error && <p className="text-destructive text-sm">{error}</p>}

        {/* Actions */}
        <div className="flex gap-2 justify-end mt-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Rating"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RatingForm;
