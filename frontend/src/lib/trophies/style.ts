// Locked house style for the AI-generated trophy hall. Anchored to the existing
// avatar style (comic book, cel-shaded, steel-blue + amber, rim lighting) so the
// trophies and the framed avatars read as one coherent set — with the app's
// adult-comic / noir direction layered on (heavier ink, halftone, film-noir grit,
// grown-up not cartoonish). The generate-and-approve tool builds each prompt from
// these.

const CORE =
  "comic book digital illustration, cel shaded, bold clean black ink outlines, " +
  "halftone Ben-Day dot shading, dark steel-blue and amber color palette, " +
  "dramatic film-noir rim lighting and deep shadows, gritty grown-up adult-comic " +
  "tone (noir, not cartoonish)";

// Per-trophy suffix — prefix each catalog subject with this for the full prompt.
export const TROPHY_STYLE =
  `${CORE}, gleaming gold, brass and amber, a single heroic trophy centered and ` +
  "isolated on a plain near-black background, museum trophy product shot, no text, no watermark";

export const trophyPrompt = (subject: string): string => `${subject} — ${TROPHY_STYLE}`;

// The hall background is just the ROOM — the trophies stand on pedestals the page
// places over the open foreground floor, so all of them stay visible at full size.
// A wide, front-on view (not a deep receding corridor) keeps that floor open. It
// includes the two empty forward-facing frames the page composites the driver
// (left) and truck (right) avatars into.
export const HALL_PROMPT =
  "An empty grand trucking hall of fame gallery, wide eye-level frontal view with a " +
  "low horizon and a broad open polished stone floor across the foreground, deep " +
  "steel-blue walls with subtle oversize-freight motifs (chains, flatbed silhouettes), " +
  "warm amber spotlights washing down the walls, a large emblem centered on the back " +
  "wall, two large ornate empty gold picture frames mounted flat and facing forward — " +
  `one on the left wall, one on the right wall, at eye level — ${CORE}, moody cinematic ` +
  "rim lighting, no pedestals, no people, no text";
