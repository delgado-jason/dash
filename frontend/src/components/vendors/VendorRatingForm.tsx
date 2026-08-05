import { useState } from "react";
import type { Vendor } from "@/types/vendor";
import type { VendorPatchPayload } from "@/types/vendorPatchPayload";
import { patchVendor } from "@/services/patchVendorService";
import { VENDOR_RATING_OPTIONS } from "@/lib/metrics/vendorRatingLabels";

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

interface VendorRatingFormProps {
  vendor: Vendor;
  onSuccess: () => void;
  onClose: () => void;
}

// Edit a vendor's rating. A change requires a reason + initials (mirrors the agent
// flow) so the vendor_rating_history keeps the "why" behind every grade.
const VendorRatingForm = ({
  vendor,
  onSuccess,
  onClose,
}: VendorRatingFormProps) => {
  const [rating, setRating] = useState<number | null>(vendor.rating ?? null);
  const [reason, setReason] = useState("");
  const [changedBy, setChangedBy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const ratingChanged = rating !== (vendor.rating ?? null);

  const handleSubmit = async () => {
    setError(null);

    if (ratingChanged && (!reason.trim() || !changedBy.trim())) {
      setError("Rating changes require a reason and initials");
      return;
    }

    if (!ratingChanged) {
      onClose();
      return;
    }

    const payload: VendorPatchPayload = {
      rating,
      reason: reason.trim(),
      changed_by: changedBy.trim(),
    };

    try {
      setIsSaving(true);
      await patchVendor(vendor.vendor_id, payload);
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update rating");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="font-body">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-foreground">
          Edit rating —{" "}
          <span className="font-normal text-muted-foreground">
            {vendor.name}
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
                {VENDOR_RATING_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

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

        <div>
          <Label htmlFor="changed_by">
            Your initials{" "}
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

        {error && <p className="text-destructive text-sm">{error}</p>}

        <div className="flex gap-2 justify-end mt-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save rating"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default VendorRatingForm;
