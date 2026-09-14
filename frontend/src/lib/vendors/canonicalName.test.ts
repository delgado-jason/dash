import { describe, it, expect } from "vitest";
import { canonicalVendorName, vendorNameKey } from "./canonicalName";

const ROLODEX = [
  { name: "Ray's Tire Service", aliases: ["Rays Tire Shop", "  RAYS TIRE  "] },
  { name: "TA Petro", aliases: [] },
  { name: "Thermo King", aliases: [] },
];

describe("canonicalVendorName — the one spelling a vendor name has", () => {
  it("a name match in another case becomes the vendor's own spelling", () => {
    expect(canonicalVendorName("ta petro", ROLODEX)).toBe("TA Petro");
    expect(canonicalVendorName("THERMO KING", ROLODEX)).toBe("Thermo King");
    expect(canonicalVendorName("  ray's tire service  ", ROLODEX)).toBe(
      "Ray's Tire Service",
    );
  });

  it("an alias match becomes the vendor's NAME, not the alias", () => {
    expect(canonicalVendorName("Rays Tire Shop", ROLODEX)).toBe("Ray's Tire Service");
    expect(canonicalVendorName("rays tire", ROLODEX)).toBe("Ray's Tire Service");
  });

  it("no match is kept as typed, trimmed", () => {
    expect(canonicalVendorName("  Cummins Atlantic ", ROLODEX)).toBe("Cummins Atlantic");
    expect(canonicalVendorName("Cummins Atlantic", [])).toBe("Cummins Atlantic");
  });

  it("a blank stays blank — nobody typed a vendor", () => {
    expect(canonicalVendorName("", ROLODEX)).toBe("");
    expect(canonicalVendorName("   ", ROLODEX)).toBe("");
  });

  it("an alias that is a PREFIX of a name does not match — exact key only", () => {
    const rolodex = [{ name: "TA Petro", aliases: ["TA Travel Center"] }];
    expect(canonicalVendorName("TA", rolodex)).toBe("TA");
    expect(canonicalVendorName("TA Pet", rolodex)).toBe("TA Pet");
    expect(canonicalVendorName("TA Petro Inc", rolodex)).toBe("TA Petro Inc");
  });

  it("a vendor with no aliases at all is safe to read", () => {
    const rolodex = [{ name: "Cummins Atlantic" } as { name: string; aliases: string[] }];
    expect(canonicalVendorName("cummins atlantic", rolodex)).toBe("Cummins Atlantic");
    expect(canonicalVendorName("Somebody Else", rolodex)).toBe("Somebody Else");
  });
});

describe("vendorNameKey — the same key Postgres generates", () => {
  it("trims the ends and lowercases, and nothing else", () => {
    expect(vendorNameKey("  TA Petro  ")).toBe("ta petro");
    expect(vendorNameKey("Thermo  King")).toBe("thermo  king");
    expect(vendorNameKey("Ray's Tire Service")).toBe("ray's tire service");
  });
});

describe("vendorNameKey — parity with Postgres btrim, ASCII spaces only", () => {
  it("keeps a trailing NBSP or tab, exactly as lower(btrim(name)) keeps it", () => {
    expect(vendorNameKey("TA Petro ")).toBe("ta petro ");
    expect(vendorNameKey("\tTA\t")).toBe("\tta\t");
    expect(vendorNameKey("  TA Petro   ")).toBe("ta petro ");
  });

  it("canonicalVendorName trims the same way, so the key it compares is the DB's", () => {
    expect(canonicalVendorName("  Thermo King  ", ROLODEX)).toBe("Thermo King");
    expect(canonicalVendorName("New Shop ", ROLODEX)).toBe("New Shop ");
  });
});
