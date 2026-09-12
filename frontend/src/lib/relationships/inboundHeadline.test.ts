import { describe, it, expect } from "vitest";
import { inboundHeadline } from "./inboundHeadline";

describe("inboundHeadline — a fraction until ten, then a percent", () => {
  it("nothing attributed yet reads 0 of 0", () => {
    expect(inboundHeadline({ attributed: 0, inbound: 0, share: null })).toBe("0 of 0");
  });

  it("under ten attributed loads stays a fraction", () => {
    expect(inboundHeadline({ attributed: 3, inbound: 0, share: 0 })).toBe("0 of 3");
    expect(inboundHeadline({ attributed: 9, inbound: 4, share: 4 / 9 })).toBe("4 of 9");
  });

  it("from ten attributed loads it is a rounded percent", () => {
    expect(inboundHeadline({ attributed: 10, inbound: 4, share: 0.4 })).toBe("40%");
    expect(inboundHeadline({ attributed: 14, inbound: 6, share: 6 / 14 })).toBe("43%");
    expect(inboundHeadline({ attributed: 20, inbound: 0, share: 0 })).toBe("0%");
  });
});
