// The sentence a failed request carries. The backend answers every refusal
// with { error: "<a sentence>" } and axios puts that body on
// error.response.data. With no body (the server down, the network gone) the
// caller's own fallback is used — never axios's message, which names a status
// code and not what to do.
export function apiErrorWord(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: unknown } } } | null)
    ?.response?.data;
  const word = data?.error;
  return typeof word === "string" && word.trim() ? word : fallback;
}
