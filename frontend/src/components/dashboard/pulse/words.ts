// A calendar day key printed as its own day — "Wed Nov 4", never zone-shifted.
export const dayWords = (k: string): string =>
  new Date(`${k.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
