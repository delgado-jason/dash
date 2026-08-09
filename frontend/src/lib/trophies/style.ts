// Locked house style for the AI-generated trophy hall — re-briefed to the
// Forge world (2026-08-09): machined steel and amber inlay, grounded and
// photographic, the comic/cel-shade era retired. Regenerating existing art to
// match is Jason's call in the Studio, a few cents per image; the prompts
// below only govern what generates NEXT. The generate-and-approve tool builds
// each prompt from these.

const CORE =
  "premium industrial 3D render, machined steel and forged metal materials, " +
  "brushed dark gunmetal with warm glowing amber inlay accents, dramatic " +
  "single-source workshop lighting with deep shadows and a subtle amber rim " +
  "light, cinematic, grounded, adult and iconic — no comic style, no cel " +
  "shading, no halftone, no cartoon, no illustration outlines";

// Per-trophy suffix — prefix each catalog subject with this for the full prompt.
// Image models can't spell, so every subject is a wordless SYMBOL and this style
// hard-forbids lettering — the app renders all text (names, numbers) over the art.
export const TROPHY_STYLE =
  `${CORE}, a bold emblematic hero symbol milled from steel with glowing amber ` +
  "inlay, centered and isolated on a plain near-black background, spotlit like " +
  "a machined trophy piece on display — absolutely no text, no words, no " +
  "letters, no numbers, no lettering, no typography, no signage, no watermark, " +
  "no captions";

export const trophyPrompt = (subject: string): string => `${subject} — ${TROPHY_STYLE}`;

// The hall background is just the empty ROOM. The page hangs the driver + truck
// portraits in its own gold frames on the walls (always aligned), and stands the
// trophies over the floor — so the AI must NOT draw its own frames or pedestals.
// A wide, front-on view with a low horizon keeps the walls and floor open.
export const HALL_PROMPT =
  "An empty grand forge-hall gallery, wide eye-level frontal view with a low " +
  "horizon and a broad open polished dark-concrete floor across the foreground, " +
  "tall brushed-steel walls with subtle oversize-freight motifs (chains, flatbed " +
  "silhouettes), warm amber cove spotlights washing down the walls, a large " +
  `milled emblem centered high on the back wall — ${CORE}, moody cinematic ` +
  "atmosphere, no picture frames, no pedestals, no people, no text";
