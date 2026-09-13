import { useState } from "react";
import type { RenewalInput } from "@/types/compliance";
import type { RenewalFormErrors } from "@/lib/compliance/renewal";
import {
  fmtDay,
  hasRenewalErrors,
  nextExpiry as nextExpiryFrom,
  renewalSheetErrors,
  todayKey,
} from "@/lib/compliance/renewal";
import {
  ErrorLine,
  FieldLabel,
  GhostButton,
  PrimaryButton,
} from "@/components/relationships/primitives";

const inputCls =
  "bg-well border border-hairline rounded-[8px] px-2 py-1.5 text-sm w-full text-ink outline-none";

// The document number goes to a different column depending on the subject, and
// the boxes stop where the columns do: drivers.cdl_number is VARCHAR(50), a
// compliance item's doc_number is capped at 60 by the server's validator. The
// CDL sheet is the one labelled this way (CompliancePage passes it).
const CDL_DOC_LABEL = "New CDL #";
const DOC_MAX = 60;
const CDL_DOC_MAX = 50;

interface Props {
  // What is being renewed, and what the row reads today — the sheet repeats it
  // so the dates being replaced are visible while they are replaced.
  subject: string;
  currentExpiry: string | null;
  // The cadence, when the item carries one: it prefills the next expiry and
  // labels it "· 24 months". null = the owner types the date.
  renewalMonths: number | null;
  currentDocNumber: string | null;
  docLabel?: string;
  onRenew: (body: RenewalInput) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
  // The server's sentence, when the write came back with one.
  error: string | null;
}

/**
 * "Mark renewed" — the four fields off the nod sheet: renewed on (today),
 * next expiry (the cadence's guess), the new document number (the old one,
 * ready to be overtyped) and a note.
 *
 * Module-level, never defined inside a render body: remounting it on every
 * parent render would blow away whatever was half-typed in it.
 */
export const RenewSheet = ({
  subject,
  currentExpiry,
  renewalMonths,
  currentDocNumber,
  docLabel = "New document #",
  onRenew,
  onCancel,
  busy,
  error,
}: Props) => {
  // The clock is read ONCE, when the sheet opens — a re-render must not move
  // the day underneath a half-filled form.
  const [openedAt] = useState(() => new Date());
  const [renewedOn, setRenewedOn] = useState(() => todayKey(openedAt));
  const [expiry, setExpiry] = useState(
    () => nextExpiryFrom(todayKey(openedAt), renewalMonths) ?? "",
  );
  // Once the owner types an expiry of their own, the cadence stops moving it.
  const [expiryEdited, setExpiryEdited] = useState(false);
  const [docNumber, setDocNumber] = useState(currentDocNumber ?? "");
  const [note, setNote] = useState("");
  const [shown, setShown] = useState(false); // errors appear on the first submit

  const errors = renewalSheetErrors({ renewedOn, nextExpiry: expiry }, openedAt);
  const show: RenewalFormErrors = shown ? errors : {};

  // Moving the renewal day re-derives the expiry through the cadence, unless
  // the owner has already set one by hand.
  const onRenewedOn = (value: string) => {
    setRenewedOn(value);
    if (!expiryEdited) setExpiry(nextExpiryFrom(value, renewalMonths) ?? "");
  };

  const submit = async () => {
    setShown(true);
    if (hasRenewalErrors(errors)) return;
    await onRenew({
      renewed_on: renewedOn,
      next_expires_on: expiry,
      doc_number: docNumber.trim() || null,
      note: note.trim() || null,
    });
  };

  return (
    <div>
      <p className="font-condensed text-[12.5px] text-faint mb-3">
        <b className="font-semibold text-ink">{subject}</b>
        {currentExpiry ? ` · due ${fmtDay(currentExpiry)}` : " · no expiry on file"}
        {" — the cycle you're closing is kept as history."}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <FieldLabel htmlFor="renewal-renewed-on">Renewed on</FieldLabel>
          <input
            id="renewal-renewed-on"
            type="date"
            className={inputCls}
            value={renewedOn}
            disabled={busy}
            onChange={(e) => onRenewedOn(e.target.value)}
          />
          <ErrorLine>{show.renewedOn}</ErrorLine>
        </div>
        <div>
          <FieldLabel htmlFor="renewal-next-expiry">
            Next expiry
            {renewalMonths ? (
              <span className="font-normal normal-case tracking-normal text-[12px] text-faint ml-2">
                · {renewalMonths} months
              </span>
            ) : null}
          </FieldLabel>
          <input
            id="renewal-next-expiry"
            type="date"
            className={inputCls}
            value={expiry}
            disabled={busy}
            onChange={(e) => {
              setExpiryEdited(true);
              setExpiry(e.target.value);
            }}
          />
          <ErrorLine>{show.nextExpiry}</ErrorLine>
        </div>
      </div>

      <div className="mt-3">
        <FieldLabel htmlFor="renewal-doc-number">{docLabel}</FieldLabel>
        <input
          id="renewal-doc-number"
          className={inputCls}
          value={docNumber}
          maxLength={docLabel === CDL_DOC_LABEL ? CDL_DOC_MAX : DOC_MAX}
          disabled={busy}
          onChange={(e) => setDocNumber(e.target.value)}
        />
        {/* The blank IS a value here: an emptied box clears the stored number
            rather than leaving the old one behind, so the sheet says so. */}
        <p className="text-[11px] text-faint mt-1">leave blank to clear</p>
      </div>

      <div className="mt-3">
        <FieldLabel htmlFor="renewal-note">Note</FieldLabel>
        <input
          id="renewal-note"
          className={inputCls}
          value={note}
          maxLength={500}
          disabled={busy}
          placeholder="optional — where, who, what changed"
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <ErrorLine>{error}</ErrorLine>

      {/* the mock's .actions: primary first, ghost beside it, left-aligned */}
      <div className="flex gap-2.5 items-center flex-wrap mt-3">
        <PrimaryButton onClick={submit} disabled={busy}>
          {busy ? "Saving…" : "Renewed"}
        </PrimaryButton>
        <GhostButton onClick={onCancel} disabled={busy}>
          Cancel
        </GhostButton>
      </div>
    </div>
  );
};
