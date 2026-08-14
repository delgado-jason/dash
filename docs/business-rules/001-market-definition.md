# 001 — Market Definition Rule

## Rule

A market covers all freight within 75 miles of a recognized
freight hub. When a load falls between two markets, assign to
the closer one. All market names must follow the format:
"[City] Market" (e.g., "Chicago Market", "Nashville Market").

## Naming Convention

- Always append "Market" to the city name
- Use the major city name only — no state, no abbreviations
- Examples: "Chicago Market", "Dallas Market", "Philadelphia Market"

## Defining a Freight Hub

A freight hub is any city that a Landstar agent would naturally
reference when discussing freight in that area. This is based on
operational familiarity, not population data.

## Edge Cases

### Load falls between two markets

Assign to whichever freight hub is closer by driving miles,
not straight-line distance.

### No recognized freight hub within 75 miles

Create a regional market using the format:
"[Direction] [State] Market"

Order is direction first, then the state, then "Market"
(e.g., "Eastern Kentucky Market", not "Kentucky Eastern Market").

Direction options: Northern, Southern, Eastern, Western, Central

Examples:

- Rural Kentucky between Louisville and Lexington →
  "Central Kentucky Market"
- Far West Texas → "West Texas Market"
- Northern Alabama outside Huntsville range →
  "Northern Alabama Market"

Document the boundary reasoning in the market notes field.

## Rationale

Standardizes lane tracking and RPM analysis across loads. Prevents
subjective market assignment that would corrupt lane performance data.
Rule is designed to minimize friction during load entry — no external
lookups required.

## Status

Active — adopted April 2026
