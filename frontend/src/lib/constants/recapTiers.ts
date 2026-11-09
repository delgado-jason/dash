import type { RecapScope } from "@/lib/metrics/recap";

// The recap pages' kicker word per scope. The bronze/silver/gold prestige
// tiers retired with the Redesign's phase B3 — the recap is a plain page.
export const RECAP_KICKER: Record<RecapScope, string> = { month: "MONTH RECAP", quarter: "QUARTER RECAP", year: "YEAR RECAP" };
