import { useEffect, useRef, useState } from "react";
import { getCitySuggestions, type CitySuggestion } from "@/services/routingService";

interface CityAutocompleteProps {
  value: string;
  onType: (city: string) => void; // free typing — parent updates the city only
  onSelect: (city: string, state: string) => void; // a suggestion was picked
  placeholder?: string;
  id?: string;
  inputClassName?: string;
  inputStyle?: React.CSSProperties;
}

// A city text field with a HERE-backed typeahead. Picking a suggestion fills a
// clean, canonical "City, ST" (via onSelect); typing is always allowed (onType).
// The parent owns the value and styling; this owns the dropdown behavior.
const CityAutocomplete = ({
  value,
  onType,
  onSelect,
  placeholder = "City",
  id,
  inputClassName,
  inputStyle,
}: CityAutocompleteProps) => {
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const focused = useRef(false);
  const skipNext = useRef(false); // suppress the fetch triggered by a pick/prefill

  // Debounced fetch as the user types (only while focused, only 2+ chars).
  useEffect(() => {
    if (!focused.current) return;
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      const s = await getCitySuggestions(q);
      if (!focused.current) return;
      setSuggestions(s);
      setOpen(s.length > 0);
      setActive(-1);
    }, 250);
    return () => clearTimeout(timer);
  }, [value]);

  const pick = (s: CitySuggestion) => {
    skipNext.current = true;
    onSelect(s.city, s.state);
    setOpen(false);
    setSuggestions([]);
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(suggestions[active]);
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
        style={inputStyle}
        onChange={(e) => onType(e.target.value)}
        onFocus={() => {
          focused.current = true;
          if (suggestions.length) setOpen(true);
        }}
        onBlur={() => {
          focused.current = false;
          // Delay so an onMouseDown pick registers before the list closes.
          setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && suggestions.length > 0 && (
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
          {suggestions.map((s, i) => (
            <li
              key={s.label}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
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
                {s.city}, <span style={{ color: "#9fb0c9" }}>{s.state}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default CityAutocomplete;
