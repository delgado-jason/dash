import { useState } from "react";
import type { Agency } from "@/types/agency";
import { createAgency } from "@/services/createAgencyService";
import { patchAgency } from "@/services/agenciesService";
import {
  ErrorLine,
  FieldLabel,
  GhostButton,
  PrimaryButton,
} from "@/components/relationships/primitives";

// The agency's own five fields, in one panel, used two ways: `+ Agency` on the
// list (Dispatch may name a desk the moment a settlement shows one — the same
// right she already has from the call screen and the load form) and EDIT on
// the agency page (the owner's, for a code typed wrong or a name a bill just
// gave you).
//
// posting_codes is NOT here and never will be: it is evidence the settlement
// feed appends to, and the API refuses a client that sends it. The rating
// keeps its own editor elsewhere, so an edit here never clears it.

const CODE_RE = /^[A-Z]{3}$/;

// A blank field means "nothing on file" — NULL, not an empty string, which
// would sort ahead of every real name under ORDER BY name NULLS LAST.
const orNull = (v: string): string | null => {
  const t = v.trim();
  return t === "" ? null : t;
};

export const AgencyForm = ({
  agency = null,
  prefillCode = "",
  onSaved,
  onCancel,
}: {
  agency?: Agency | null; // present = edit that agency; absent = create one
  prefillCode?: string; // a settlement-only code the shelf is naming
  onSaved: (saved: Agency) => void;
  onCancel: () => void;
}) => {
  const [code, setCode] = useState(agency?.agency_code ?? prefillCode.toUpperCase());
  const [name, setName] = useState(agency?.name ?? "");
  const [phone, setPhone] = useState(agency?.phone ?? "");
  const [email, setEmail] = useState(agency?.email ?? "");
  const [notes, setNotes] = useState(agency?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editing = agency != null;

  const save = async () => {
    const clean = code.trim().toUpperCase();
    // Caught here so a typo answers instantly; the API refuses it too.
    if (!CODE_RE.test(clean)) {
      setError("An agency code is three letters — the one after the dash on the freight bill.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = editing
        ? await patchAgency(agency.agency_id, {
            agency_code: clean,
            name: orNull(name),
            phone: orNull(phone),
            email: orNull(email),
            notes: orNull(notes),
          })
        : await createAgency({
            agency_code: clean,
            name: orNull(name),
            phone: orNull(phone),
            email: orNull(email),
            rating: null,
            notes: orNull(notes),
          });
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the agency");
    } finally {
      // Both paths, not just the failure: the list's form stays mounted after
      // a save (the page only closes the CREATE one), so a button left saying
      // "Saving…" and disabled would refuse the next edit forever.
      setSaving(false);
    }
  };

  return (
    <div className="ds2-board mt-3 p-3.5">
      <p className="font-condensed font-semibold text-[11px] tracking-[.14em] uppercase text-faint mb-3">
        {editing ? `Edit ${agency.agency_code}` : "New agency"}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <FieldLabel htmlFor="agency_code">Agency code</FieldLabel>
          <input
            id="agency_code"
            value={code}
            maxLength={3}
            placeholder="CPL"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="ds-input uppercase tracking-[.12em]"
          />
        </div>
        <div>
          <FieldLabel htmlFor="agency_name">Name</FieldLabel>
          <input
            id="agency_name"
            value={name}
            maxLength={120}
            placeholder="blank until a freight bill names it"
            onChange={(e) => setName(e.target.value)}
            className="ds-input"
          />
        </div>
        <div>
          <FieldLabel htmlFor="agency_phone">Phone</FieldLabel>
          <input
            id="agency_phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="ds-input"
          />
        </div>
        <div>
          <FieldLabel htmlFor="agency_email">Email</FieldLabel>
          <input
            id="agency_email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="ds-input"
          />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel htmlFor="agency_notes">Notes</FieldLabel>
          <input
            id="agency_notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="ds-input"
          />
        </div>
      </div>
      <ErrorLine>{error}</ErrorLine>
      <div className="flex items-center gap-2 mt-3">
        <PrimaryButton size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : editing ? "Save changes" : "Add agency"}
        </PrimaryButton>
        <GhostButton size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </GhostButton>
      </div>
    </div>
  );
};
