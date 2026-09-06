// "load-confirmation" -> "LOAD CONFIRMATION", "pod" -> "POD",
// "tx-oversize-permit" -> "TX OVERSIZE PERMIT". Doctypes come from the
// server's naming convention (lowercase-hyphens); display is dash's job.
export function formatDoctype(doc_type: string): string {
  const cleaned = doc_type.trim();
  if (!cleaned) return "DOCUMENT";
  return cleaned.replace(/-+/g, " ").toUpperCase();
}
