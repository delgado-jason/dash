import { getRatingLabel } from "@/lib/metrics/ratingLabels";
import { Star } from "lucide-react";

interface RatingDisplayProps {
  rating: number | null | undefined;
}

export const RatingDisplay = ({ rating }: RatingDisplayProps) => {
  if (!rating) {
    return (
      <div>
        <div className="flex">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} color="var(--color-muted)" />
          ))}
          <p className="ml-4 text-muted-text font-condensed uppercase tracking-wider">
            {getRatingLabel(rating)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex mt-4">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            fill={rating >= n ? "var(--color-primary)" : "var(--color-steel)"}
            color={rating >= n ? "var(--color-primary)" : "var(--color-steel)"}
          />
        ))}
        <p className="ml-4 text-muted-text font-condensed uppercase tracking-wider">
          {getRatingLabel(rating).slice(4)}
        </p>
      </div>
    </div>
  );
};
