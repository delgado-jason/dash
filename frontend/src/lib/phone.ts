// Format a phone number to the US standard "(XXX) XXX-XXXX" as the user types,
// so what lands in the database is consistent no matter how they key it in. A
// leading US country code is dropped; a partial number formats progressively;
// extra digits past ten are kept as an extension rather than mangled.
export const formatPhone = (input: string): string => {
  const raw = input.replace(/\D/g, "");
  const d = raw.length === 11 && raw.startsWith("1") ? raw.slice(1) : raw;
  if (d.length === 0) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  const base = `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
  return d.length <= 10 ? base : `${base} x${d.slice(10)}`;
};

// The dial / text doors — digits (and a leading +) only, so "(956) 555-0142
// x99" still opens the dialer. One place for both, shared by the agent sheet
// and the call screen.
export const telHref = (phone: string): string => `tel:${phone.replace(/[^+\d]/g, "")}`;
export const smsHref = (phone: string): string => `sms:${phone.replace(/[^+\d]/g, "")}`;
