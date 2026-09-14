// Two spellings of one shop. "Rays Tire Shop" and "Ray's Tire Service" are the
// same tire man; case and punctuation are noise, and so is the last word — the
// part that drifts is "Shop" vs "Service" vs "Tire & Auto".
//
// So the key is the first TWO words, letters and digits only: enough of the
// name to be that shop and nothing else, and short enough that the tail can
// wander. A ONE-word name keys on itself and nothing more, which is why "TA"
// and "TA Petro" do NOT match — "ta" against "tapetro". Two letters are not
// enough evidence to merge a truck stop chain with whatever else starts "TA",
// and the flag is a prompt to a human, so it stays quiet unless it is sure.
//
// `normalizedWords` is the normalizer on its own — the name as lowercase words,
// letters and digits only — for the callers that need to read the first word
// by itself (the vendors page's "looks like" pill).
export const normalizedWords = (name: string): string[] =>
  name
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]+/g, ""))
    .filter(Boolean);

export const spellingKey = (name: string): string =>
  normalizedWords(name).slice(0, 2).join("");
