// Copy to clipboard, best-effort — a failed copy still leaves the text on
// screen, so there is nothing useful to throw.
export const copyText = (t: string): void => {
  try {
    void navigator.clipboard.writeText(t);
  } catch {
    /* text is visible anyway */
  }
};
