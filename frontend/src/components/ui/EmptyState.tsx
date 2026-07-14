import type { ReactNode } from "react";

// A little flatbed on an open road — the character piece for "nothing here yet".
const TruckRoad = () => (
  <svg width="132" height="66" viewBox="0 0 132 66" className="mx-auto" aria-hidden="true">
    {/* horizon glow */}
    <circle cx="104" cy="30" r="13" fill="#e8940a" opacity="0.12" />
    {/* road */}
    <line x1="8" y1="54" x2="124" y2="54" stroke="#3a4459" strokeWidth="2.5" strokeLinecap="round" />
    <line
      x1="14"
      y1="54"
      x2="118"
      y2="54"
      stroke="#5b6b82"
      strokeWidth="2"
      strokeDasharray="6 9"
      strokeLinecap="round"
      opacity="0.55"
    />
    {/* trailer bed */}
    <rect x="20" y="36" width="44" height="11" rx="1.5" fill="#2a3347" stroke="#4a5570" strokeWidth="1" />
    <rect x="20" y="43" width="44" height="2" fill="#e8940a" opacity="0.75" />
    {/* cab */}
    <path d="M66 47 V31 h7 l6 8 v8 Z" fill="#9daabb" />
    <rect x="67.5" y="32.5" width="5.5" height="5.5" rx="1" fill="#60a5fa" opacity="0.55" />
    {/* wheels */}
    <circle cx="31" cy="48" r="4.2" fill="#0d1117" stroke="#5b6b82" strokeWidth="1.3" />
    <circle cx="55" cy="48" r="4.2" fill="#0d1117" stroke="#5b6b82" strokeWidth="1.3" />
    <circle cx="72" cy="48" r="4.2" fill="#0d1117" stroke="#5b6b82" strokeWidth="1.3" />
  </svg>
);

interface Props {
  title: string;
  hint?: ReactNode;
  icon?: ReactNode; // override the default illustration
}

export const EmptyState = ({ title, hint, icon }: Props) => (
  <div className="text-center py-8 px-4">
    {icon ?? <TruckRoad />}
    <p className="text-light font-condensed text-lg mt-3">{title}</p>
    {hint && <p className="text-muted-text text-sm mt-1">{hint}</p>}
  </div>
);
