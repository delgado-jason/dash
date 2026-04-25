# 001 — Flatten Loads (Remove Trips for v0.1.0)

## Decision

Removed the trips table from v0.1.0 scope. All operational data
lives directly on the loads table.

## Rationale

The trip/load separation added complexity that blocked v0.1.0 launch.
Odometer delta minus loaded miles gives deadhead without a separate
trip record.

## Consequences

- trips and trip_stops tables exist in schema but are dormant
- Multi-load trips handled in v0.2.0 when reintroduced

## Status

Active — adopted April 2026
