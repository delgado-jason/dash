// GL-106 (Jason, 2026-11-06): every load has its booker. The scoreboard, the
// dispatcher card and the Recap all split loads by who booked them, so a load
// without one drops out of all three. The form says so first and refuses the
// save; the API refuses the same case with the same sentence.
export const BOOKER_REQUIRED =
  "Every load needs its booker — the scoreboard, the card and the Recap all split loads by who booked them.";

// The sentence when no booker is chosen; null when the load may be saved.
export const bookerNeeded = (bookedBy: string | null | undefined): string | null =>
  bookedBy == null || bookedBy.trim() === "" ? BOOKER_REQUIRED : null;
