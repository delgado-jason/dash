import { useMemo, useState } from "react";
import type { Vendor } from "@/types/vendor";
import type { UnfiledShop } from "@/types/unfiledShop";
import { vendorNameKey } from "@/lib/vendors/canonicalName";
import { matchVendors, type VendorMatch } from "@/lib/vendors/matchVendors";
import { mergeSentence } from "@/lib/vendors/mergeSentence";
import { mergeIntoVendor } from "@/services/mergeVendorService";
import { createVendor } from "@/services/createVendorService";
import {
  FieldLabel,
  PrimaryButton,
  GhostButton,
  ErrorLine,
} from "@/components/relationships/primitives";

type PickerRow = { kind: "create" } | { kind: "vendor"; match: VendorMatch };

// The picker: the same listbox mechanics as VendorAutocomplete, with one extra
// row on top — "Create X and merge" — because the vendor a log name belongs to
// is often not filed yet either. A sibling rather than a prop on
// VendorAutocomplete: this one opens with the whole rolodex, hands back a
// vendor (not a string), and carries a row that isn't a vendor at all.
const MergePicker = ({
  text,
  onType,
  onPick,
  onCreate,
  vendors,
  createName,
}: {
  text: string;
  onType: (value: string) => void;
  onPick: (vendor: Vendor) => void;
  onCreate: () => void;
  vendors: Vendor[];
  createName: string | null;
}) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const rows = useMemo<PickerRow[]>(
    () => [
      ...(createName ? [{ kind: "create" as const }] : []),
      ...matchVendors(text, vendors).map((match) => ({
        kind: "vendor" as const,
        match,
      })),
    ],
    [createName, text, vendors],
  );

  const choose = (index: number) => {
    const row = rows[index];
    if (!row) return;
    if (row.kind === "create") onCreate();
    else onPick(row.match.vendor);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || rows.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <input
        id="merge-into"
        className="ds-input"
        value={text}
        autoComplete="off"
        placeholder="the vendor these rows belong to"
        onChange={(e) => {
          onType(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        // Delay so an onMouseDown pick registers before the list closes.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && rows.length > 0 && (
        <ul
          role="listbox"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "calc(100% + 4px)",
            zIndex: 30,
            margin: 0,
            padding: 4,
            listStyle: "none",
            background: "#141b28",
            border: "1px solid #2a3347",
            borderRadius: 9,
            maxHeight: 220,
            overflowY: "auto",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          {rows.map((row, i) => (
            <li
              key={row.kind === "create" ? "create-and-merge" : row.match.vendor.vendor_id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(i);
              }}
              onMouseEnter={() => setActive(i)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 14,
                color: "#f4f7fb",
                background: i === active ? "#20293a" : "transparent",
              }}
            >
              {row.kind === "create" ? (
                <>
                  <span style={{ color: "#f5b03a", fontSize: 12 }}>+</span>
                  <span>Create "{createName}" and merge</span>
                </>
              ) : (
                <>
                  <span style={{ color: "#5f6b80", fontSize: 12 }}>◈</span>
                  <span>
                    {row.match.vendor.name}
                    {row.match.alias && (
                      <span style={{ color: "#9fb0c9" }}>
                        {" "}
                        · also "{row.match.alias}"
                      </span>
                    )}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// The merge door (12A): fold a log spelling into the vendor it belongs to. The
// vendor keeps the spelling as an alias and those log rows are rewritten to the
// vendor's name, in one transaction — so the vendor's spend, the shop's BY
// VENDOR board and the truck card stop disagreeing.
const MergeVendorSheet = ({
  row,
  vendors,
  prefill,
  onClose,
  onMerged,
}: {
  row: UnfiledShop;
  vendors: Vendor[];
  // From the row's "looks like" pill: a vendor to start selected, or a name to
  // start typed (so "Create X and merge" is the first thing he sees).
  prefill: { vendor: Vendor | null; text: string };
  onClose: () => void;
  onMerged: () => void;
}) => {
  const [selected, setSelected] = useState<Vendor | null>(prefill.vendor);
  const [text, setText] = useState(prefill.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typed = text.trim();
  const typedKey = vendorNameKey(typed);
  // The typed text is this row's OWN name — there is nothing to merge into it.
  const isOwnName = typed.length > 0 && typedKey === vendorNameKey(row.name);
  // A name no vendor answers to — by its own name or by an alias a merge filed
  // — is a vendor to create on the way through.
  const ownedAlready = vendors.some(
    (v) =>
      vendorNameKey(v.name) === typedKey ||
      (v.aliases ?? []).some((a) => vendorNameKey(a) === typedKey),
  );
  const createName =
    typed.length > 0 && !isOwnName && !ownedAlready ? typed : null;

  const into = selected ? selected.name : createName;

  const merge = async () => {
    if (!into || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Create first when the vendor isn't filed yet, then merge into it —
      // the alias and the rewrite land together on the server.
      const target =
        selected ?? (await createVendor({ name: into, category: "Shop" }));
      // Hold on to it before the merge: if the merge fails, a retry must reuse
      // this vendor, not create a second one under the same name.
      setSelected(target);
      await mergeIntoVendor(target.vendor_id, row.name);
      onMerged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to merge that name");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-[450px] mx-4 max-h-[90vh] bg-canvas text-ink overflow-y-auto shadow-xl rounded-[12px] p-4 sm:p-6 border border-hairline">
        <FieldLabel htmlFor="merge-into">Merge "{row.name}" into</FieldLabel>
        <MergePicker
          text={text}
          onType={(value) => {
            setText(value);
            setSelected(null);
          }}
          onPick={(vendor) => {
            setSelected(vendor);
            setText(vendor.name);
          }}
          onCreate={() => setSelected(null)}
          vendors={vendors}
          createName={createName}
        />
        {isOwnName && (
          <p className="font-condensed text-[12px] text-faint mt-1.5">
            that's this name — use Add
          </p>
        )}

        <div
          className="bg-well rounded-[10px] px-3 py-2.5 mt-3"
          style={{ boxShadow: "inset 0 2px 6px rgba(0,0,0,.45)" }}
        >
          <p className="font-condensed font-semibold text-[10px] tracking-[.14em] uppercase text-amber-hi">
            DASH
          </p>
          <p className="font-condensed text-[13px] text-dim leading-[1.5] mt-1">
            {into
              ? `${mergeSentence(row, into)} "${row.name}" is kept as an alias, so the next time it is typed on a service it files here on its own.`
              : "Pick the vendor these log rows belong to."}
          </p>
        </div>

        <div className="flex gap-2 mt-4">
          <PrimaryButton onClick={merge} disabled={!into || busy}>
            Merge
          </PrimaryButton>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
        </div>
        <ErrorLine>{error}</ErrorLine>
      </div>
    </div>
  );
};

export default MergeVendorSheet;
