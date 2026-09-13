import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import { withCustomerEnd } from "./loadsService";

// Decision 5A (074): every service that hands a Load to the app runs it
// through this one coercion — /loads, /loads/:id, the PATCH response, and the
// agent dossier's loads — so no reader downstream ever has to ask whether the
// column was there.
const raw = (o: Record<string, unknown>) =>
  ({ load_id: "L1", origin_city: "Atlanta", origin_state: "GA", ...o }) as unknown as Load;

describe("withCustomerEnd", () => {
  it("coerces a payload without customer_end to 'shipper' — a pre-074 row reads as it always did", () => {
    expect(withCustomerEnd(raw({})).customer_end).toBe("shipper");
    expect(withCustomerEnd(raw({ customer_end: null })).customer_end).toBe("shipper");
  });

  it("leaves the rest of the row exactly as it arrived", () => {
    expect(withCustomerEnd(raw({ load_number: "2543056" }))).toMatchObject({
      load_id: "L1",
      load_number: "2543056",
      origin_city: "Atlanta",
      origin_state: "GA",
    });
  });

  it("keeps a mark a person actually saved", () => {
    expect(withCustomerEnd(raw({ customer_end: "receiver" })).customer_end).toBe("receiver");
    expect(withCustomerEnd(raw({ customer_end: "neither" })).customer_end).toBe("neither");
  });

  it("maps an empty array to an empty array", () => {
    expect(([] as Load[]).map(withCustomerEnd)).toEqual([]);
  });
});
