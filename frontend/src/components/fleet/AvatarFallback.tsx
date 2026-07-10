import type { AvatarKind } from "@/services/avatarsService";

// Flat, on-brand default avatars shown until a generated/uploaded image exists.
export const AvatarFallback = ({ kind }: { kind: AvatarKind }) => {
  if (kind === "truck") {
    return (
      <svg viewBox="0 0 200 200" width="100%" height="100%" role="img" aria-label="Truck">
        <rect width="200" height="200" fill="#12161f" />
        <ellipse cx="100" cy="168" rx="66" ry="9" fill="#000" opacity="0.35" />
        <rect x="56" y="40" width="6" height="58" rx="3" fill="#5a6478" />
        <rect x="138" y="40" width="6" height="58" rx="3" fill="#5a6478" />
        <polygon points="144,66 170,82 170,150 144,150" fill="#232c3f" />
        <rect x="52" y="58" width="92" height="98" rx="12" fill="#33425b" />
        <rect x="64" y="68" width="68" height="30" rx="7" fill="#0d1117" />
        <rect x="64" y="102" width="68" height="4" rx="2" fill="#e8940a" />
        <rect x="72" y="110" width="52" height="34" rx="4" fill="#1c2333" stroke="#e8940a" strokeWidth="1.5" />
        <line x1="82" y1="112" x2="82" y2="142" stroke="#4a5468" strokeWidth="2" />
        <line x1="92" y1="112" x2="92" y2="142" stroke="#4a5468" strokeWidth="2" />
        <line x1="102" y1="112" x2="102" y2="142" stroke="#4a5468" strokeWidth="2" />
        <line x1="112" y1="112" x2="112" y2="142" stroke="#4a5468" strokeWidth="2" />
        <rect x="54" y="112" width="14" height="16" rx="4" fill="#e8940a" />
        <rect x="128" y="112" width="14" height="16" rx="4" fill="#e8940a" />
        <rect x="52" y="146" width="96" height="12" rx="3" fill="#3a4152" />
        <circle cx="72" cy="160" r="11" fill="#0d1117" /><circle cx="72" cy="160" r="4" fill="#5a6478" />
        <circle cx="128" cy="160" r="11" fill="#0d1117" /><circle cx="128" cy="160" r="4" fill="#5a6478" />
      </svg>
    );
  }
  if (kind === "trailer") {
    return (
      <svg viewBox="0 0 200 200" width="100%" height="100%" role="img" aria-label="Trailer">
        <rect width="200" height="200" fill="#12161f" />
        <ellipse cx="100" cy="150" rx="74" ry="9" fill="#000" opacity="0.35" />
        <polygon points="26,110 174,110 182,120 18,120" fill="#33425b" />
        <rect x="18" y="118" width="164" height="10" fill="#232c3f" />
        <rect x="150" y="86" width="8" height="26" rx="2" fill="#5a6478" />
        <rect x="150" y="104" width="10" height="10" rx="2" fill="#e8940a" />
        <rect x="24" y="110" width="150" height="3" fill="#e8940a" opacity="0.8" />
        <circle cx="60" cy="134" r="11" fill="#0d1117" /><circle cx="60" cy="134" r="4" fill="#5a6478" />
        <circle cx="82" cy="134" r="11" fill="#0d1117" /><circle cx="82" cy="134" r="4" fill="#5a6478" />
        <circle cx="150" cy="134" r="11" fill="#0d1117" /><circle cx="150" cy="134" r="4" fill="#5a6478" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" role="img" aria-label="Driver">
      <rect width="200" height="200" fill="#1c2333" />
      <path d="M45,180 C45,132 66,116 100,116 C134,116 155,132 155,180 Z" fill="#5a6478" />
      <circle cx="100" cy="80" r="34" fill="#5a6478" />
      <path d="M66,74 C66,52 82,44 100,44 C118,44 134,52 134,74 C124,64 76,64 66,74 Z" fill="#47506a" />
    </svg>
  );
};
