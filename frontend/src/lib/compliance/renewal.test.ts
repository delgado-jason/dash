import { describe, it, expect } from "vitest";
import {
  earlierCount,
  errText,
  fmtDay,
  hasRenewalErrors,
  isDayKey,
  nextExpiry,
  renewalLine,
  renewalSheetErrors,
  todayKey,
} from "./renewal";

// Every clock here is injected, never the machine's — a date-dependent test
// that reads Date.now() rots the day the calendar passes its fixture.
// vitest.config pins TZ to America/Chicago, so local-vs-UTC is a real gap.

describe("todayKey — the sheet opens on the OWNER's day, not UTC's", () => {
  it("takes the local calendar day", () => {
    expect(todayKey(new Date("2026-09-13T18:00:00Z"))).toBe("2026-09-13");
  });

  it("a late Central evening is still today, though UTC has already turned", () => {
    // 2026-09-13 21:00 CDT = 2026-09-14 02:00Z. toISOString would say the 14th.
    expect(todayKey(new Date("2026-09-14T02:00:00Z"))).toBe("2026-09-13");
  });
});

describe("isDayKey — a real day, not just a well-shaped string", () => {
  it("passes real days, leap day included", () => {
    for (const good of ["2026-09-13", "2024-02-29", "2026-01-31"])
      expect(isDayKey(good)).toBe(true);
  });

  it("refuses a day that does not exist rather than rolling it over", () => {
    // Two different failures, both refused: "2026-02-30" PARSES and rolls to
    // March 2 (only formatting the parsed day back catches it), while month
    // "00" passes the regex and parses to NaN.
    for (const bad of ["2026-02-30", "2026-04-31", "2025-02-29", "2026-13-01", "2026-00-10"])
      expect(isDayKey(bad)).toBe(false);
  });

  it("refuses timestamps, US dates, blanks and nulls", () => {
    for (const bad of ["2026-09-13T00:00:00Z", "09/13/2026", "2026-9-13", "", null, undefined])
      expect(isDayKey(bad)).toBe(false);
  });
});

describe("nextExpiry — the cadence's guess, clamped to the month", () => {
  it("lands on the same day number when the month has one", () => {
    expect(nextExpiry("2026-09-13", 24)).toBe("2028-09-13");
    expect(nextExpiry("2026-09-13", 12)).toBe("2027-09-13");
    expect(nextExpiry("2026-09-13", 1)).toBe("2026-10-13");
    expect(nextExpiry("2026-09-13", 60)).toBe("2031-09-13");
  });

  it("rolls the year across December", () => {
    expect(nextExpiry("2026-12-31", 1)).toBe("2027-01-31");
    expect(nextExpiry("2026-11-30", 2)).toBe("2027-01-30");
    expect(nextExpiry("2026-01-01", 120)).toBe("2036-01-01");
  });

  it("clamps to the end of the landing month — Jan 31 + 1 is Feb 28, never Mar 3", () => {
    expect(nextExpiry("2026-01-31", 1)).toBe("2026-02-28");
    expect(nextExpiry("2024-01-31", 1)).toBe("2024-02-29"); // leap year
    expect(nextExpiry("2026-01-31", 3)).toBe("2026-04-30");
    expect(nextExpiry("2026-05-31", 1)).toBe("2026-06-30");
    expect(nextExpiry("2026-08-31", 6)).toBe("2027-02-28"); // and across the year
    expect(nextExpiry("2024-02-29", 12)).toBe("2025-02-28");
  });

  it("no cadence, no date, or a date that isn't real → null (the sheet asks)", () => {
    expect(nextExpiry("2026-09-13", null)).toBeNull();
    expect(nextExpiry("2026-09-13", 0)).toBeNull();
    expect(nextExpiry("2026-09-13", 1.5)).toBeNull();
    expect(nextExpiry(null, 12)).toBeNull();
    expect(nextExpiry("", 12)).toBeNull();
    expect(nextExpiry("2026-02-30", 12)).toBeNull();
  });
});

describe("fmtDay — a day key read back in UTC so it never shifts", () => {
  it("prints the mock's Mon d, yyyy", () => {
    expect(fmtDay("2024-10-02")).toBe("Oct 2, 2024");
    expect(fmtDay("2026-01-01")).toBe("Jan 1, 2026");
  });

  it("reads a raw DATE column too — the day is sliced off first, then checked", () => {
    // compliance_items.expires_on and drivers.cdl_expiration come through
    // node-postgres as local-midnight timestamps, not day keys. Printing
    // "null" for a real expiry was the bug this slice fixes.
    expect(fmtDay("2026-10-02T04:00:00.000Z")).toBe("Oct 2, 2026");
    expect(fmtDay("2026-01-01T05:00:00.000Z")).toBe("Jan 1, 2026");
    // Even a UTC-evening timestamp keeps its own day: the slice happens before
    // any Date is built, so the zone never gets a vote.
    expect(fmtDay("2026-10-02T23:30:00.000Z")).toBe("Oct 2, 2026");
  });

  it("null, blank and a non-day in → null out", () => {
    expect(fmtDay(null)).toBeNull();
    expect(fmtDay(undefined)).toBeNull();
    expect(fmtDay("")).toBeNull();
    expect(fmtDay("2026-02-30")).toBeNull();
    // A string long enough to survive the slice and still not be a day.
    expect(fmtDay("not a date at all")).toBeNull();
    expect(fmtDay("2026-13-01T04:00:00.000Z")).toBeNull();
  });
});

describe("renewalLine — the history line under the row", () => {
  // A cycle the code can actually write: renewed Sep 18, closing a paper that
  // was due Oct 2, and the new cycle running to the cadence's next date.
  const cycle = {
    renewal_id: "r1",
    renewed_on: "2026-09-18",
    expired_on: "2026-10-02",
    next_expires_on: "2028-09-18",
  };

  it("reads as the mock does — renewed, then what it was due", () => {
    expect(renewalLine(cycle)).toBe("renewed Sep 18, 2026 · was due Oct 2, 2026");
  });

  it("reads the same off raw DATE columns, not just to_char'd day keys", () => {
    expect(
      renewalLine({
        ...cycle,
        renewed_on: "2026-09-18T05:00:00.000Z",
        expired_on: "2026-10-02T04:00:00.000Z",
      }),
    ).toBe("renewed Sep 18, 2026 · was due Oct 2, 2026");
  });

  it("a cycle that carried no expiry drops the second half, never prints an empty one", () => {
    expect(renewalLine({ ...cycle, expired_on: null })).toBe("renewed Sep 18, 2026");
  });

  it("no renewal at all → null, and the row shows no line", () => {
    expect(renewalLine(null)).toBeNull();
    expect(renewalLine(undefined)).toBeNull();
    // Garbage where a date should be is nothing to say, not "renewed null".
    expect(renewalLine({ ...cycle, renewed_on: "nope" })).toBeNull();
  });
});

describe("errText — the server's own sentence, or a fallback", () => {
  it("reads the sentence the API answered with", () => {
    const e = {
      response: { data: { error: "The next expiry has to come after the renewal date." } },
    };
    expect(errText(e)).toBe("The next expiry has to come after the renewal date.");
  });

  it("falls back when there is no sentence to read", () => {
    expect(errText(new Error("Network Error"))).toBe("Could not save");
    expect(errText({ response: { data: {} } })).toBe("Could not save");
    expect(errText({ response: { status: 500 } })).toBe("Could not save");
    expect(errText({ response: { data: { error: "" } } })).toBe("Could not save");
    expect(errText("a thrown string")).toBe("Could not save");
    expect(errText(null)).toBe("Could not save");
    expect(errText(undefined)).toBe("Could not save");
  });
});

describe("earlierCount — what the fold offers", () => {
  it("the newest cycle IS the line, so the fold starts at two", () => {
    expect(earlierCount(0)).toBe(0);
    expect(earlierCount(1)).toBe(0);
    expect(earlierCount(2)).toBe(1);
    expect(earlierCount(5)).toBe(4);
  });

  it("a missing count is nothing to fold", () => {
    expect(earlierCount(null)).toBe(0);
    expect(earlierCount(undefined)).toBe(0);
  });
});

describe("renewalSheetErrors — the sheet's gate, a problem per field", () => {
  const now = new Date("2026-09-13T18:00:00Z"); // Sep 13, Central

  it("a filled sheet passes", () => {
    const e = renewalSheetErrors({ renewedOn: "2026-09-13", nextExpiry: "2028-09-13" }, now);
    expect(e).toEqual({});
    expect(hasRenewalErrors(e)).toBe(false);
  });

  it("names the missing day, and the missing expiry, each under its own field", () => {
    expect(renewalSheetErrors({ renewedOn: "", nextExpiry: "" }, now)).toEqual({
      renewedOn: "A renewal needs the day it was renewed.",
      nextExpiry: "A renewal needs the next expiry date.",
    });
  });

  it("an item with no cadence leaves the expiry empty — and it can't be sent that way", () => {
    const e = renewalSheetErrors({ renewedOn: "2026-09-13", nextExpiry: "" }, now);
    expect(e.nextExpiry).toBe("A renewal needs the next expiry date.");
    expect(e.renewedOn).toBeUndefined();
    expect(hasRenewalErrors(e)).toBe(true);
  });

  it("refuses a renewal dated past tomorrow, and allows backdating", () => {
    expect(renewalSheetErrors({ renewedOn: "2026-09-14", nextExpiry: "2028-09-14" }, now)).toEqual({});
    expect(
      renewalSheetErrors({ renewedOn: "2026-09-15", nextExpiry: "2028-09-15" }, now).renewedOn,
    ).toBe("A renewal can't be dated in the future.");
    expect(renewalSheetErrors({ renewedOn: "2019-04-02", nextExpiry: "2021-04-02" }, now)).toEqual({});
  });

  it("the tomorrow ceiling is the LOCAL one, and it rolls the month and year", () => {
    const eve = new Date("2027-01-01T02:00:00Z"); // 2026-12-31 20:00 CST
    expect(renewalSheetErrors({ renewedOn: "2027-01-01", nextExpiry: "2028-01-01" }, eve)).toEqual({});
    expect(
      renewalSheetErrors({ renewedOn: "2027-01-02", nextExpiry: "2028-01-02" }, eve).renewedOn,
    ).toBe("A renewal can't be dated in the future.");
  });

  it("the next expiry has to come after the renewal, not land on it", () => {
    const msg = "The next expiry has to come after the renewal date.";
    expect(renewalSheetErrors({ renewedOn: "2026-09-13", nextExpiry: "2026-09-13" }, now).nextExpiry).toBe(msg);
    expect(renewalSheetErrors({ renewedOn: "2026-09-13", nextExpiry: "2026-09-12" }, now).nextExpiry).toBe(msg);
    expect(renewalSheetErrors({ renewedOn: "2026-09-13", nextExpiry: "2026-09-14" }, now)).toEqual({});
  });

  it("a date the calendar does not have is refused on either field", () => {
    expect(renewalSheetErrors({ renewedOn: "2026-02-30", nextExpiry: "2028-09-13" }, now).renewedOn).toBe(
      "That isn't a real date.",
    );
    expect(renewalSheetErrors({ renewedOn: "2026-09-13", nextExpiry: "2027-02-30" }, now).nextExpiry).toBe(
      "That isn't a real date.",
    );
  });
});
