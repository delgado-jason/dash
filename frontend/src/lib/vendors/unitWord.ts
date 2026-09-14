// What a bridge row worked on, in the word the board uses — but only when the
// answer is unambiguous. A name that has touched the truck AND the trailer says
// nothing useful in one word, so it says nothing at all.
const WORD: Record<string, string> = {
  tractor: "truck",
  trailer: "trailer",
  both: "both",
  apu: "apu",
};

export const unitWord = (units: string[]): string | null => {
  const distinct = new Set(units);
  if (distinct.size !== 1) return null;
  const [only] = [...distinct];
  return WORD[only] ?? null;
};
