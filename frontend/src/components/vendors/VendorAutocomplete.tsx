import { useMemo, useRef, useState } from "react";
import type { Vendor } from "@/types/vendor";
import { canonicalVendorName } from "@/lib/vendors/canonicalName";
import { matchVendors } from "@/lib/vendors/matchVendors";

// The vendor box on the log sheet — the rolodex, as a typeahead. Same dropdown
// mechanics as CityAutocomplete (listbox under the input, arrows, Enter, Escape,
// mouse-down pick, blur delay), over names the app already holds, so no fetch.
//
// Two jobs. Picking a row writes the vendor's NAME. And on blur, a typed name
// that IS a vendor under another spelling is rewritten to the vendor's own —
// that is "canonicalizes an alias as typed" (12A): type "Rays Tire Shop" after
// the merge and the service files itself under "Ray's Tire Service", so the
// spend readout, the BY VENDOR board and the truck card all add the same way.
// The server does this again on write; this is so he SEES it happen.
const VendorAutocomplete = ({
  id,
  value,
  onChange,
  vendors,
  placeholder,
  inputClassName,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  vendors: Vendor[];
  placeholder?: string;
  inputClassName?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // A pick already wrote a canonical name — don't let the blur that follows
  // second-guess it. Only ever touched in handlers, never read during render.
  const justPicked = useRef(false);

  // One character is enough: this list is in memory, and he usually knows the
  // first letters of the shop he means.
  const matches = useMemo(
    () => (value.trim().length >= 1 ? matchVendors(value, vendors) : []),
    [value, vendors],
  );

  const pick = (name: string) => {
    justPicked.current = true;
    onChange(name);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(matches[active].vendor.name);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        className={inputClassName}
        onChange={(e) => {
          justPicked.current = false;
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay so an onMouseDown pick registers before the list closes.
          setTimeout(() => {
            setOpen(false);
            if (justPicked.current) {
              justPicked.current = false;
              return;
            }
            const canonical = canonicalVendorName(value, vendors);
            if (canonical !== value) onChange(canonical);
          }, 150);
        }}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && matches.length > 0 && (
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
          {matches.map((m, i) => (
            <li
              key={m.vendor.vendor_id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m.vendor.name);
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
              <span style={{ color: "#5f6b80", fontSize: 12 }}>◈</span>
              <span>
                {m.vendor.name}
                {m.alias && (
                  <span style={{ color: "#9fb0c9" }}> · also "{m.alias}"</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default VendorAutocomplete;
