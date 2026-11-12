import { useState } from "react";
import type { Agent } from "@/types/agent";
import type { AgentPatchPayload } from "@/types/agentPatchPayload";
import { patchAgent } from "@/services/patchAgentService";
import {
  STANDING_OPTIONS,
  standingOf,
  standingPatch,
  type Standing,
} from "@/lib/agents/standing";

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
import { nameOf } from "@/lib/relationships/nameOf";

interface RatingFormProps {
  agent: Agent;
  onSuccess: () => void;
  onClose: () => void;
}

const RatingForm = ({ agent, onSuccess, onClose }: RatingFormProps) => {
  // --- STATE ---
  // ONE control over two columns. "Parked" is the bottom of the rating scale
  // rather than a separate switch, because marking a desk in two places is how
  // four of Jason's parked agents ended up still carrying three stars — the
  // same default as 39 active ones. See lib/agents/standing.ts.
  const current = standingOf(agent);
  const [standing, setStanding] = useState<Standing | null>(current);
  const [reason, setReason] = useState("");
  const [changedBy, setChangedBy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const parking = standing === "parked";
  const ratingChanged = standing !== current;

  // --- HANDLER ---
  const handleSubmit = async () => {
    setError(null);

    // Client-side guard: a change needs a reason + initials.
    // (The backend enforces this too — this is just faster feedback.)
    if (ratingChanged && (!reason.trim() || !changedBy.trim())) {
      setError(
        parking
          ? "Parking a desk needs a reason and initials"
          : "Rating changes require a reason and initials",
      );
      return;
    }

    if (!ratingChanged || standing == null) {
      onClose();
      return;
    }

    // The patch decides what actually moves: parking leaves the stored rating
    // alone so un-parking restores it, and a plain re-rating never writes
    // work_status. The park reason is the same sentence as the audit reason —
    // asking for it twice is how the two drift apart again.
    const payload: AgentPatchPayload = {
      ...standingPatch(agent, standing, reason),
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
          Edit standing —{" "}
          <span className="font-normal text-muted-foreground">
            {nameOf(agent)}
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
          <Label htmlFor="rating">Standing</Label>
          <Select
            value={standing !== null ? String(standing) : undefined}
            onValueChange={(value) =>
              setStanding(value === "parked" ? "parked" : (Number(value) as Standing))
            }
          >
            <SelectTrigger id="rating">
              <SelectValue placeholder="Select a standing" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {STANDING_OPTIONS.map((option) => (
                  <SelectItem key={String(option.value)} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {parking && (
            <p className="text-muted-foreground text-sm mt-1.5">
              The Load Scorer will refuse to quietly score a load from this desk.{" "}
              {agent.rating != null && (
                <>Its {agent.rating}-star rating is kept, so un-parking restores it.</>
              )}
            </p>
          )}
        </div>

        {/* Reason — only meaningful when the rating changes */}
        <div>
          <Label htmlFor="reason">
            Reason {ratingChanged && <span className="text-primary">*</span>}
          </Label>
          <Textarea
            id="reason"
            placeholder={parking ? "Why are you parking this desk?" : "Why is the rating changing?"}
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
            {isSaving ? "Saving..." : parking ? "Park this desk" : "Save standing"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RatingForm;
