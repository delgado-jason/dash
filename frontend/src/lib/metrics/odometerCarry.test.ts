import { describe, it, expect } from "vitest";
import { nextLoadStart, carryWords } from "./odometerCarry";
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";

// Jason, 2026-11-10: "I want you to make tests for every situation where the
// odometer reading could get misconstrued." Each case below is one way the
// carry could pick a number that is not where the truck actually is.
const L = (over: Partial<Load> = {}): Load =>
  ({
    load_number: "L",
    load_status: "delivered",
    pickup_date: "2026-11-05",
    delivery_date: "2026-11-07",
    odometer_start: 611212,
    odometer_end: 612773,
    ...over,
  }) as unknown as Load;

const T = (over: Partial<Trip> = {}): Trip =>
  ({
    trip_date: "2026-11-03",
    trip_type: "deadhead",
    status: "completed",
    odometer_start: 611054,
    odometer_end: 611212,
    ...over,
  }) as unknown as Trip;

// ---------------------------------------------------------------- the rule
describe("nextLoadStart — the last completed movement wins", () => {
  it("a load with nothing after it carries its delivery odometer", () => {
    expect(nextLoadStart([L({ load_number: "4333118" })], [])).toMatchObject({
      reading: 612773, source: "load", ref: "4333118",
    });
  });

  it("A TRIP AFTER THE LOAD WINS — Jason's case, and his real Nov 3 sequence", () => {
    // load 4036503 ended 611,054; the deadhead trip then ran to 611,212, and
    // load 4333118 correctly started there.
    const c = nextLoadStart(
      [L({ load_number: "4036503", delivery_date: "2026-11-02", odometer_end: 611054 })],
      [T({ trip_date: "2026-11-03", odometer_start: 611054, odometer_end: 611212 })],
    );
    expect(c).toMatchObject({ reading: 611212, source: "trip", ref: "2026-11-03" });
  });

  it("a LOAD after the trip wins just the same — it is recency, not a preference for one kind", () => {
    const c = nextLoadStart(
      [L({ load_number: "4333118", delivery_date: "2026-11-07", odometer_end: 612773 })],
      [T({ trip_date: "2026-11-03", odometer_end: 611212 })],
    );
    expect(c).toMatchObject({ reading: 612773, source: "load" });
  });

  it("two movements closing the same day take the higher reading", () => {
    const c = nextLoadStart(
      [L({ delivery_date: "2026-11-07", odometer_end: 612773 })],
      [T({ trip_date: "2026-11-07", odometer_end: 612900 })],
    );
    expect(c).toMatchObject({ reading: 612900, source: "trip" });
  });
});

// ------------------------------------------------- the live failure, pinned
describe("nextLoadStart — a fuel stop is a point INSIDE a run, never the end of one", () => {
  // This is the defect the naive prefill would have shipped. On 2026-11-10
  // `GREATEST(loads, trips, fuel, services)` returned 612,828 — the Cisco fill
  // — while load 4493038 was still rolling from 612,773.
  it("fuel readings are not an input at all: the signature takes loads and trips only", () => {
    const c = nextLoadStart([L({ odometer_end: 612773 })], []);
    // 612,828 exists in the book as a fill. It can never reach this function,
    // and that is the point — there is no argument to pass it through.
    expect(c.reading).toBe(612773);
  });

  it("a fill inside a CLOSED load cannot become the next start", () => {
    // load 611,212 → 612,773 with a Tuscaloosa fill at 611,988 inside it.
    const c = nextLoadStart([L({ odometer_start: 611212, odometer_end: 612773 })], []);
    expect(c.reading).toBe(612773);
    expect(c.reading).not.toBe(611988);
  });
});

// ------------------------------------------------------------- the refusals
describe("nextLoadStart — it refuses rather than guessing", () => {
  it("A LOAD STILL ROLLING has no known end, so there is no honest next start", () => {
    const c = nextLoadStart(
      [L({ load_number: "4333118", odometer_end: 612773 }),
       L({ load_number: "4493038", load_status: "in_transit", odometer_start: 612773, odometer_end: null })],
      [],
    );
    expect(c).toMatchObject({ reading: null, why: "rolling" });
  });

  it("a trip still active refuses for the same reason", () => {
    const c = nextLoadStart([L()], [T({ status: "active", odometer_end: null })]);
    expect(c).toMatchObject({ reading: null, why: "rolling" });
  });

  it("an empty book refuses — a first load has nothing to carry from", () => {
    expect(nextLoadStart([], [])).toMatchObject({ reading: null, why: "none" });
  });

  it("a book with only OPEN-ENDED records refuses: an end is what makes a movement", () => {
    const c = nextLoadStart([L({ load_status: "booked", odometer_end: null })], []);
    expect(c).toMatchObject({ reading: null, why: "none" });
  });

  it("CONTRADICTORY data refuses: the latest run is not the highest reading", () => {
    // A fat-fingered end on the later load. Date order and odometer order
    // disagree, so neither can be trusted and a human has to settle it.
    const c = nextLoadStart(
      [L({ load_number: "EARLY", delivery_date: "2026-11-02", odometer_end: 612773 }),
       L({ load_number: "LATE", delivery_date: "2026-11-07", odometer_end: 610000 })],
      [],
    );
    expect(c).toMatchObject({ reading: null, why: "contradictory" });
  });
});

// ------------------------------------------------- loads that never moved
describe("nextLoadStart — a load that never ran carries nothing", () => {
  it("A TONU WITH A TYPED START is ignored — Jason's 4115417 is exactly this", () => {
    // 611,054 start, no end, status tonu: the truck turned up and left again.
    const c = nextLoadStart(
      [L({ load_number: "4036503", delivery_date: "2026-11-02", odometer_end: 611054 }),
       L({ load_number: "4115417", load_status: "tonu", delivery_date: "2026-11-04",
           odometer_start: 611054, odometer_end: null })],
      [],
    );
    expect(c).toMatchObject({ reading: 611054, ref: "4036503" });
  });

  it("a TONU that somehow carries an END is still ignored — the status decides, not the data", () => {
    const c = nextLoadStart(
      [L({ load_number: "REAL", delivery_date: "2026-11-02", odometer_end: 611054 }),
       L({ load_number: "TONU", load_status: "tonu", delivery_date: "2026-11-08", odometer_end: 999999 })],
      [],
    );
    expect(c).toMatchObject({ reading: 611054, ref: "REAL" });
  });

  it("a cancelled load is ignored, and so is a cancelled trip", () => {
    const c = nextLoadStart(
      [L({ load_number: "REAL", delivery_date: "2026-11-02", odometer_end: 611054 }),
       L({ load_number: "X", load_status: "cancelled", delivery_date: "2026-11-08", odometer_end: 999999 })],
      [T({ status: "cancelled", trip_date: "2026-11-09", odometer_end: 888888 })],
    );
    expect(c).toMatchObject({ reading: 611054, ref: "REAL" });
  });
});

// ------------------------------------------------------- dates and numbers
describe("nextLoadStart — undated and unreadable records", () => {
  it("a closed load with NO delivery date cannot be ordered, so it never wins", () => {
    const c = nextLoadStart(
      [L({ load_number: "DATED", delivery_date: "2026-11-02", odometer_end: 611054 }),
       L({ load_number: "UNDATED", delivery_date: null, odometer_end: 999999 })],
      [],
    );
    expect(c).toMatchObject({ reading: 611054, ref: "DATED" });
  });

  it("an unreadable odometer is not a zero", () => {
    const c = nextLoadStart(
      [L({ load_number: "GOOD", delivery_date: "2026-11-02", odometer_end: 611054 }),
       L({ load_number: "JUNK", delivery_date: "2026-11-08", odometer_end: "abc" as unknown as number })],
      [],
    );
    // The junk row is not a movement at all, so GOOD stands — and crucially it
    // did NOT read as 0, which would have tripped the contradictory guard.
    expect(c).toMatchObject({ reading: 611054, ref: "GOOD" });
  });

  it("a timestamp delivery_date is sliced to its day like every other date in dash", () => {
    const c = nextLoadStart(
      [L({ load_number: "TS", delivery_date: "2026-11-07T04:00:00.000Z", odometer_end: 612773 })],
      [],
    );
    expect(c).toMatchObject({ reading: 612773, date: "2026-11-07" });
  });

  it("a zero reading is a real number, not a blank", () => {
    const c = nextLoadStart([L({ delivery_date: "2026-11-07", odometer_end: 0 })], []);
    expect(c.reading).toBe(0);
  });
});

// -------------------------------------------------------- what it says
describe("carryWords — the source is always on screen", () => {
  it("names the load or the trip it came from", () => {
    expect(carryWords(nextLoadStart([L({ load_number: "4333118" })], []))).toBe(
      "from load 4333118's delivery",
    );
    expect(
      carryWords(nextLoadStart([], [T({ trip_date: "2026-11-03" })])),
    ).toBe("from the 2026-11-03 trip");
  });
  it("explains a refusal instead of leaving a blank unexplained", () => {
    expect(carryWords(nextLoadStart([L({ load_status: "in_transit", odometer_end: null })], []))).toMatch(
      /still rolling/,
    );
    expect(carryWords(nextLoadStart([], []))).toMatch(/no completed run/);
  });
});
