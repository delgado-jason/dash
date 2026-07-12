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
// Image models can't spell, so every subject is a wordless SYMBOL and this style
// hard-forbids lettering — the app renders all text (names, numbers) over the art.
export const TROPHY_STYLE =
  `${CORE}, gleaming gold, brass, chrome and amber, a bold emblematic hero symbol ` +
  "centered and isolated on a plain near-black background, dramatic single-spotlight " +
  "insignia, rich and iconic — absolutely no text, no words, no letters, no numbers, " +
  "no lettering, no typography, no signage, no watermark, no captions";

export const trophyPrompt = (subject: string): string => `${subject} — ${TROPHY_STYLE}`;

// The hall background is just the empty ROOM. The page hangs the driver + truck
// portraits in its own gold frames on the walls (always aligned), and stands the
// trophies over the floor — so the AI must NOT draw its own frames or pedestals.
// A wide, front-on view with a low horizon keeps the walls and floor open.
export const HALL_PROMPT =
  "An empty grand trucking hall of fame gallery, wide eye-level frontal view with a " +
  "low horizon and a broad open polished stone floor across the foreground, tall deep " +
  "steel-blue walls with subtle oversize-freight motifs (chains, flatbed silhouettes), " +
  "warm amber spotlights washing down the walls, a large emblem centered high on the " +
  `back wall — ${CORE}, moody cinematic rim lighting, no picture frames, no pedestals, ` +
  "no people, no text";
