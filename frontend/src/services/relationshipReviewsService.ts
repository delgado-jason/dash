import api from "./api";
import { AxiosError } from "axios";

// relationship_reviews (073) — the month sign-off and the quarter audit
// (REL-01 v2.0 §5H). One row per (period, kind); signing again replaces the
// targets and re-stamps who and when.
export type ReviewKind = "month" | "quarter";

export interface RelationshipReview {
  review_id: string;
  period_key: string; // 'YYYY-MM' for a month · 'YYYY-Qn' for a quarter
  kind: ReviewKind;
  targets: string | null; // the non-blank lines, newline-joined
  reviewed_by: string | null;
  reviewed_at: string; // ISO
  reviewed_by_name: string | null;
}

export interface SignReviewInput {
  period_key: string;
  kind: ReviewKind;
  targets: string; // one to three lines for a month, one to five names for a quarter
}

const named = (error: unknown, fallback: string): Error => {
  if (error instanceof AxiosError && error.response?.data) {
    const body = error.response.data as { error?: string; details?: string[] };
    const detail = Array.isArray(body.details) && body.details.length ? ` — ${body.details.join("; ")}` : "";
    if (body.error) return new Error(`${body.error}${detail}`);
  }
  return new Error(fallback);
};

export const getRelationshipReviews = async (): Promise<RelationshipReview[]> => {
  const res = await api.get("/relationship-reviews");
  return res.data.reviews ?? [];
};

// Owner only — the backend answers "Only the owner signs off." otherwise.
export const signRelationshipReview = async (input: SignReviewInput): Promise<RelationshipReview> => {
  try {
    const res = await api.post("/relationship-reviews", input);
    return res.data.review;
  } catch (error) {
    throw named(error, "Couldn't sign the period");
  }
};
