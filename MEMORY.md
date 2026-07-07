# MEMORY.md — Live State & Behavior Log

> **READ THIS FILE FIRST**, before `CLAUDE.md`, before any action.
> This file holds live project state and a running log of behavior/functionality changes.
> **Whenever Jason asks for new behavior or functionality from me, append it to the BEHAVIOR LOG below and update the relevant state.**

---

## HOW TO USE THIS FILE

1. On session start: read this file top to bottom, then read `CLAUDE.md`.
2. Before acting: check "Active work" and "Open decisions" so you resume correctly (don't re-derive or re-scope settled things).
3. When Jason requests new behavior/functionality: add a dated entry to the **BEHAVIOR LOG** and update state sections as needed.
4. Keep this file current — it is the source of truth for _where things are_.

---

## CURRENT FOCUS

**Active arc:** `dash` — **Trips (non-revenue miles) feature, Option B.**
Recording non-revenue "deadhead" miles. Building it lightweight: trips used ONLY for non-revenue movements (childless trips). Loads stay untouched. The full "trip-as-parent-of-loads" model stays deferred/dormant scaffolding.

**Teaching mode:** Build-it-yourself (concept → Jason writes → review). Resumed after a deliberate "dashboard rush" where Jason temporarily asked for direct code.

---

## PROJECT STATE SNAPSHOT

### dash — current version ~1.22.0 (dashboard arc complete)

Shipped recently:

- Full **agent detail page** (header, rating, metrics, loads table, contact, activity timeline merging notes + rating history, with inline note composer).
- **Agents directory** (list page, sorted by rating desc, unrated sunk to bottom).
- **Notes backend** (agent_notes table, services, routes) + notes in getAgent.
- **Dashboard v1** (7-issue arc): data layer (revenue MTD/last/YTD, deadhead %, monthly revenue & RPM series, outstanding loads), KPI strip, revenue-over-time bar chart, RPM-vs-break-even line chart, outstanding loads list. Uses recharts.

**Known caveats to revisit:**

- Dashboard `BREAK_EVEN_RPM` constant set to **$2.96** — NOT confirmed as true cost-per-mile. If wrong, the profitability lens (RPM color, break-even line) is wrong. Confirm against real CPM work.
- `patchTrip` still has old `allowedFields` (missing `is_estimated`) — inconsistent with `createTrip`. Fix if trip-editing is built.

### dts-tools — COLD (weeks stale)

Side Course B (Python). Backend recon phase. Next queued task: `notes/comdata-recon.md` (ComData statement structure) — never done. Open thread: PDF-to-CSV library question (tabula-py/camelot/pdfplumber `extract_tables()`) unresolved. Report scope simplified to 4 metrics (prev-week gross tractor revenue, gross trailer revenue, compliance events, YTD 1099). Flag consciously — past its watch window.

---

## TRIPS ARC — DETAILED STATE

**Model decided (Option B):** A non-revenue trip = `trip_type: 'deadhead'`, `trip_source: 'user'`, `status: 'completed'`. Loads untouched. `tripStops` and `trip_type='revenue'` stay dormant for a future full-model arc.

**trips table (EXISTS in prod):** trip_id (uuid PK), user_id (FK), truck_id (FK, nullable), driver_id (FK, nullable), trip_type (enum revenue|deadhead), trip_source (enum user|system), trip_date (date), status (enum planned|active|completed|cancelled, default planned), odometer_start/end (int4, nullable, CHECK >=0), is_estimated (bool, default true), trip_number (int4, UNIQUE, auto via `nextval('trips_trip_number_seq')`), created_at/updated_at.

**Issue #1 — backend fixes: DONE + tested.**

- `createTrip` now sets trip_type='deadhead', trip_source='user', status='completed'; `is_estimated` added to allowedFields.
- getTrips/getTrip: inner JOINs → LEFT JOINs (nullable truck/driver — else null-FK trips vanish).
- `.http` verified: deadhead trip inserts, auto-numbers, lists (even with null truck+driver).

**Issue #2 — frontend data layer: essentially DONE (confirm merged).**

- `Trip` type (types/trip.ts) — correct nullability, enum literal unions.
- `TripInput` type (types/tripInput.ts) — FIX APPLIED: odometers are `number` (not string), fields optional (`?:`) except trip_date.
- `getTrips` + `createTrip` services (tripsService.ts) — extract `response.data.trips` / `.trip`.
- `useTrips(refreshKey)` hook — FIX APPLIED: `setIsLoading(true)` + `setError(null)` at start of each fetch (was stuck false / stale error on refetch).

**Trip categories contract — DONE on dev (2026-07-07), NOT yet on prod.** Migration `023_add_trip_purpose.sql` (CREATE TYPE trip_purpose enum + DELETE test rows + ADD COLUMN NOT NULL) ran clean on dev. Types (`Trip`, `TripInput`) carry `trip_purpose` required/non-null. Backend: `createTrip` allowedFields + two-part validation (presence check in `validateTripCreate` + value-check rule in shared `rules`) done & `.http`-tested. **PROD MIGRATION STILL PENDING — apply at ship time alongside the code deploy; re-run `SELECT count(*) FROM loads WHERE trip_id IS NOT NULL` on PROD (must be 0) before the DELETE runs there.** NOTE: `getDeadheadPercent` NOT yet wired to trips (still backlog).

**Issue #3 — Trips page: NOT STARTED (categories now defined — UNBLOCKED, ready to build).** Route + "Trips" nav item, trips list, create form WITH: category selector (`trip_purpose`, required), odometer_start + odometer_end capture, and **odometer_start auto-prefill** (must-have this version — see below). Deadhead-wiring into dashboard stays backlog.

**ODOMETER MODEL (clarified 2026-07-07 — corrects a prior misread by the instructor):** `getDeadheadPercent` (`frontend/src/lib/metrics/dashboard.ts:70`) is computed PER LOAD: `Σ(odometer_end − odometer_start) − Σ(loaded_miles)` over delivered loads that have both odometers. It is NOT gap-inferred between consecutive loads. Consequence: empty miles NOT tied to fetching a load (home/shop/personal/repositioning) currently FALL THROUGH — a real, uncounted gap. Trips fill that gap by carrying their OWN `odometer_start/end`. Loads + trips must TILE the odometer line (each segment's start = prior segment's end; no gaps, no overlaps) or deadhead double-counts. Wiring trips INTO the deadhead metric stays deferred (backlog), but capture odometers now so that wiring is later a pure calc change (no migration/backfill).

**DEADHEAD vs REPOSITIONING (Jason's vocabulary — governs, do NOT conflate):** *deadhead* = per-load empty miles to reach the next load's pickup (the odo-delta-minus-loaded above); automatic, lives on the load, NEVER a trip — cost forced by the load taken. *repositioning* = empty miles driven to a BETTER MARKET with NO booked load being fetched; speculative; REQUIRES a logged trip to capture the odo gap; is one of the four categories.

**ODOMETER PREFILL (must-have this version — data protection; Brandie also inputs):** create-trip form auto-prefills `odometer_start` from the truck's LATEST recorded odometer = `MAX(odometer_end)` across BOTH loads AND trips (NOT just the last load's drop — else back-to-back repositioning trips overlap). Open build sub-decision (settle when building the form): source it via a small backend endpoint vs. frontend-derived from already-loaded data.

---

## OPEN DECISIONS (resolve at next session start)

1. **TRIP CATEGORIES — RESOLVED 2026-07-07.** Final list: `repositioning | home | shop | personal`, **required**, as a new `trip_purpose` ENUM + column on trips. No "Other" bucket (add ENUM values later if a real one appears; near-empty table = trivial migration). "bobtail" rejected — it's a truck *configuration* (no trailer), not a purpose; would be a separate boolean if ever needed. Vocabulary: see DEADHEAD vs REPOSITIONING in the Trips Arc section.
   - **Build touches:** (a) migration — `trip_purpose` ENUM + column (table ~empty, no backfill); (b) backend — add to `createTrip` allowedFields + validation (required); (c) types — add to `Trip` and `TripInput`; (d) Issue #3 page WITH the category selector from the start. **NEXT STEP: Jason writes the migration.**

2. **Version cleanup:** Jason accidentally ran `npm version minor` (without `--no-git-tag-version`) and intended to undo it. CONFIRM version is at the correct number before the next bump.

---

## REFERENCE SPECIFICS (volatile — update as the stack/paths change)

**dash — stack & locations:**

- Frontend: React 19 + TypeScript + Vite + Tailwind + shadcn/ui, on Vercel. Path alias `@/`. Local: `~/projects/dash/frontend/`.
- Backend: Express 5 + Postgres (Supabase); two projects (prod + dts-dash-dev). Local: `~/projects/dash/backend/`. `db` from `db/pool.js` (`db.query`; `db.pool.connect()` for transactions).
- Charts: **recharts** (needs explicit hex/CSS-var colors, not Tailwind classes; needs explicit-height `ResponsiveContainer`).
- Testing/REST: **Vitest**; `.http`/`requests.rest` (REST Client) — re-run Login for a fresh JWT (~1hr expiry).
- Version lives in `frontend/package.json`, treated as the app version. Bump via `npm version <type> --no-git-tag-version` from `frontend/`, commit, tag manually on main after squash-merge.
- Commit format: `type: description - closes #N` (repeat keyword for multiple: `closes #X, closes #Y`).
- GitHub: user `delgado-jason`, repo `dash`, project board "DTS - TMS Roadmap".

**dash — brand kit (8 tokens):** steel `#0d1117`, iron `#1c2333`, plate `#2a3347`, amber `#e8940a` (primary), light/chrome `#ebedf5`, muted-text/silver `#9daabb`, amber-dark `#b5700a`, amber-light `#f5b03a`. Semantic status tokens: positive(green)/negative(red)/aware(amber)/neutral/info(blue).

**dts-tools — location & setup:**

- Location: `~/terminal-course/dts-tools/`. Venv at `venv/` — **every session starts with `source venv/bin/activate`** (look for `(venv)`; without it `python3` may fall back to system Python 2.7).
- PDF parsing: **pdfplumber**. Parser architecture: one file per document type; no function over 30 lines.
- GitHub-first, conventional commits, iTerm2 + VS Code.
- (Side Course B = Python. Current progress/queued tasks are under "dts-tools — COLD" above.)

---

## BACKLOG (logged, not scheduled)

- **Lane Profitability page** (standalone, cross-agent aggregate, RPM-ranked/color-coded; regions via a state→region frontend constant; future map with geocoded markets). Was next-up before trips redirect.
- **Agent customer intelligence** (direct-shipper vs spot-market distinction; shipper concentration; search by customer geography — lives on agents list).
- **Richer agents list** (search/filter; per-agent metrics → the SQL-aggregate-vs-JS-function decision, deferred).
- **Cost data into dash** → upgrades dashboard from revenue-lens to true net-profit; makes break-even computed not a constant.
- **Wire trips into dashboard deadhead metric** (currently trips are standalone v1; deadhead calc uses load odometers only).
- **Flag loads/trips missing odometer readings** (data-quality feature).
- Chores: remove dead delete-agent route; drop obsolete `agents.notes` column; build out placeholder pages (Fuel Entries etc.); backend should return DATE cols as plain YYYY-MM-DD strings (band-aid: `{timeZone:'UTC'}`).
- **IFTA: explicitly OUT of scope** — Jason decided to leave IFTA to third-party software.

---

## BEHAVIOR LOG

_Append a dated entry whenever Jason requests new behavior or functionality from me. Newest at top._

- **2026-07-07** — Trips arc decisions locked. (1) Categories = `repositioning | home | shop | personal`, **required**, new `trip_purpose` ENUM+column, no "Other", bobtail rejected. (2) Jason's vocabulary: *repositioning* (empty move to a better market, no booked load) needs a logged trip; *deadhead* (per-load empty miles to reach the next pickup = odo delta − loaded) is automatic, NOT a trip — distinct concepts, do not conflate. (3) Instructor corrected a misread of `getDeadheadPercent` — it's per-load, NOT gap-inferred, so home/repositioning miles fall through a real gap; trips fill it via their own odometer window; loads+trips must tile. (4) Odometer_start auto-prefill from the truck's LATEST recorded odometer (max odometer_end across loads AND trips) is a MUST-HAVE this version (data protection; Brandie also inputs). Issue #3 now unblocked — next step is Jason writing the migration.
- **2026-07-05** — Established the two-file agent system: read `MEMORY.md` first, then `CLAUDE.md`, before any action. Update `MEMORY.md`'s BEHAVIOR LOG whenever new behavior/functionality is requested. (Initial setup.)
- **(baseline)** — Teaching contract: instructor mode (concept → Jason writes → review); no finished code unless explicitly asked; mini-project new concepts before real files; direct/no-sycophancy/minimal-formatting; recon before building; reinforce "too heavy for v1" restraint. (See CLAUDE.md.)
