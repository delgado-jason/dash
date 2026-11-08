import { AxiosError } from "axios";

// A load save the server refused. `message` keeps the long-standing
// "error — detail; detail" shape; `details` carries the server's own sentences
// (the 400 body's `details: [sentences]`) so a form can print them as they are.
export class LoadSaveError extends Error {
  details: string[];
  constructor(message: string, details: string[] = []) {
    super(message);
    this.name = "LoadSaveError";
    this.details = details;
  }
}

// Read an API refusal into a LoadSaveError, or null when it has no body.
export const loadSaveErrorFrom = (error: unknown): LoadSaveError | null => {
  if (!(error instanceof AxiosError) || !error.response?.data) return null;
  const body = error.response.data as { error?: string; details?: unknown };
  const details = Array.isArray(body.details) ? body.details.filter((d): d is string => typeof d === "string") : [];
  if (!body.error) return null;
  return new LoadSaveError(`${body.error}${details.length ? ` — ${details.join("; ")}` : ""}`, details);
};
