import { describe, it, expect } from "vitest";
import {
  CONTACT_TYPES,
  contactTypeLabel,
  contactKind,
  isProactive,
  pickerTypes,
  defaultTouchType,
} from "./contactTypes";

describe("the registry — REL-01 v2.0's words", () => {
  it("carries every enum value the database knows (064 + 068 + 073)", () => {
    const values = CONTACT_TYPES.map((t) => t.value).sort();
    expect(values).toEqual(
      [
        "capacity", "check_in", "appreciation", "close_out", "cold", "inbound_inquiry", "qualification", "other",
        "milestone", "holiday", "reactivation", "owner_personal", "load_in_progress", "freight_bill",
      ].sort(),
    );
  });

  it("relabels the v1 survivors in the SOP's vocabulary", () => {
    expect(contactTypeLabel("capacity")).toBe("Capacity heads-up");
    expect(contactTypeLabel("cold")).toBe("Prospecting");
    expect(contactTypeLabel("inbound_inquiry")).toBe("Load offer");
  });

  it("marks retired rows so old history still reads, and passes unknowns through", () => {
    expect(contactTypeLabel("check_in")).toBe("Check-in (retired)");
    expect(contactTypeLabel("appreciation")).toBe("Appreciation (retired)");
    expect(contactTypeLabel("qualification")).toBe("Qualification (retired)");
    expect(contactTypeLabel("something_new")).toBe("something_new");
  });
});

describe("contactKind / isProactive — what the cap and the cooling clock read", () => {
  it("nurture and prospecting types from us are proactive", () => {
    for (const type of ["capacity", "milestone", "holiday", "reactivation", "cold"]) {
      expect(isProactive({ type, direction: "outbound" })).toBe(true);
    }
  });

  it("operational work is never capped; 'other' from us is operational", () => {
    for (const type of ["close_out", "load_in_progress", "freight_bill", "other"]) {
      expect(contactKind(type, "outbound")).toBe("operational");
      expect(isProactive({ type, direction: "outbound" })).toBe(false);
    }
  });

  it("anything THEY initiated is inbound, whatever it was filed under", () => {
    expect(contactKind("inbound_inquiry", "inbound")).toBe("inbound");
    expect(contactKind("other", "inbound")).toBe("inbound");
    expect(contactKind("capacity", "inbound")).toBe("inbound");
    expect(isProactive({ type: "capacity", direction: "inbound" })).toBe(false);
  });

  it("the Owner's thread is its own kind and never counts against the cap", () => {
    expect(contactKind("owner_personal", "outbound")).toBe("owner");
    expect(isProactive({ type: "owner_personal", direction: "outbound" })).toBe(false);
  });

  it("an unknown type from us reads as operational — never silently capped", () => {
    expect(contactKind("mystery", "outbound")).toBe("operational");
  });
});

describe("pickerTypes — what the form offers", () => {
  it("outbound for Dispatch: proactive + operational, no retired, no inbound, no owner thread", () => {
    const values = pickerTypes("outbound", { admin: false }).map((t) => t.value);
    expect(values).toEqual([
      "capacity", "milestone", "holiday", "reactivation", "cold",
      "close_out", "load_in_progress", "freight_bill", "other",
    ]);
  });

  it("the admin also sees Owner personal", () => {
    const values = pickerTypes("outbound", { admin: true }).map((t) => t.value);
    expect(values).toContain("owner_personal");
    expect(values).not.toContain("check_in");
  });

  it("inbound offers Load offer and Other only", () => {
    expect(pickerTypes("inbound", { admin: true }).map((t) => t.value)).toEqual(["other", "inbound_inquiry"]);
  });
});

describe("defaultTouchType — the book's no-context default", () => {
  it("tiered → capacity heads-up; prospect who hauled → reactivation; stranger → prospecting", () => {
    expect(defaultTouchType({ relationship_tier: 2 }, 6)).toBe("capacity");
    expect(defaultTouchType({ relationship_tier: null }, 2)).toBe("reactivation");
    expect(defaultTouchType({ relationship_tier: null }, 0)).toBe("cold");
  });
});
