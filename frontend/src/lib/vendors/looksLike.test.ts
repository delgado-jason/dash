import { describe, it, expect } from "vitest";
import { looksLike } from "./looksLike";

const v = (name: string, aliases: string[] = []) => ({ name, aliases });

describe("looksLike — the amber pill on a bridge row", () => {
  it("points a log spelling at the vendor that already owns it", () => {
    expect(looksLike("Rays Tire Shop", [v("Ray's Tire Service")], [])).toEqual({
      target: "Ray's Tire Service",
      kind: "vendor",
    });
  });

  it("matches a vendor's ALIAS too, and still names the vendor", () => {
    expect(
      looksLike("Rays Tire Shop", [v("Big Al's", ["Rays Tire Service"])], []),
    ).toEqual({ target: "Big Al's", kind: "vendor" });
  });

  it("a one-word name matches the longer name it starts: TA → TA Petro", () => {
    expect(looksLike("TA", [], ["TA Petro"])).toEqual({
      target: "TA Petro",
      kind: "unfiled",
    });
  });

  it("and the longer one stays quiet — one pill between the pair", () => {
    expect(looksLike("TA Petro", [], ["TA"])).toBeNull();
  });

  it("Loves → Love's Travel Stop — punctuation is noise", () => {
    expect(looksLike("Loves", [], ["Love's Travel Stop"])).toEqual({
      target: "Love's Travel Stop",
      kind: "unfiled",
    });
    expect(looksLike("Love's Travel Stop", [], ["Loves"])).toBeNull();
  });

  it("case and punctuation are ignored on the two-word key", () => {
    expect(looksLike("rays tire shop", [], ["Ray's Tire Service"])).toEqual({
      target: "Ray's Tire Service",
      kind: "unfiled",
    });
  });

  it("a rolodex twin beats an unfiled twin", () => {
    expect(
      looksLike("Rays Tire Shop", [v("Ray's Tire Service")], ["Rays Tire Repair"]),
    ).toEqual({ target: "Ray's Tire Service", kind: "vendor" });
  });

  it("two shops that only share a first word are NOT twins", () => {
    expect(looksLike("Cummins Sales", [v("Cummins Atlantic")], [])).toBeNull();
    expect(looksLike("Cummins Sales", [], ["Cummins Atlantic"])).toBeNull();
  });

  it("nothing to match against is null, not a crash", () => {
    expect(looksLike("Thermo King", [], [])).toBeNull();
    expect(looksLike("", [v("Thermo King")], ["TA Petro"])).toBeNull();
    expect(looksLike("Thermo King", [v("")], [""])).toBeNull();
  });

  it("the same name on the unfiled list is never its own target", () => {
    expect(looksLike("TA Petro", [], ["ta petro ", "TA Petro"])).toBeNull();
  });

  it("equal-length twins: the one that sorts first wears the pill", () => {
    // Same length, same spellingKey ("bobstire") — the tie-break is the sort.
    expect(looksLike("Bobs Tire Ab", [], ["Bobs Tire Co"])).toEqual({
      target: "Bobs Tire Co",
      kind: "unfiled",
    });
    expect(looksLike("Bobs Tire Co", [], ["Bobs Tire Ab"])).toBeNull();
  });
});
