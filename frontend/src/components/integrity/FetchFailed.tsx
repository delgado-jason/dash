// What a page says when a fetch fails (Nod Sheet "The Protection Stage",
// mock 5; P7, nodded 2026-11-05): a red line that names what didn't load and
// offers Retry — never the empty state, which would claim there is no data
// when the data exists and the request failed.
interface Props {
  what: string; // "the P&L" · "the fuel log" · "the recap"
  onRetry: () => void;
  detail?: string; // defaults to "the server didn't answer"
  className?: string;
}

export const FetchFailed = ({ what, onRetry, detail, className = "" }: Props) => (
  <p className={"font-condensed text-[14px] text-status-negative-text " + className} role="alert">
    Couldn't load {what} — {detail ?? "the server didn't answer"}.{" "}
    <button type="button" className="font-semibold underline-offset-2 hover:underline" onClick={onRetry}>
      Retry ›
    </button>
  </p>
);
