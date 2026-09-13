import { describe, it, expect } from "vitest";
import {
  customerEndOf,
  footprintPoint,
  partyLabel,
  suggestCustomerEnd,
  type CustomerEndLoadLike,
} from "./customerEnd";

// The real shape of the load that forced decision 5A: 2543056, a CNC machine
// picked up at a tradeshow marshalling yard in Atlanta and delivered to Mike
// Sorrentino's customer, C R Onsrud in Troutman, NC.
const atlanta = (o: Partial<CustomerEndLoadLike> = {}): CustomerEndLoadLike => ({
  load_id: "2543056",
  agent_id: "mike",
  agent: "Mike Sorrentino",
  origin_city: "Atlanta",
  origin_state: "GA",
  destination_city: "Troutman",
  destination_state: "NC",
  shipper_name: "Marshalling Yard",
  receiver_name: "C R Onsrud",
  ...o,
});

// Mike's five other loads: C R Onsrud ships, someone else receives.
const troutmanLoads = (n = 5): CustomerEndLoadLike[] =>
  Array.from({ length: n }, (_, i) => ({
    load_id: `T${i}`,
    agent_id: "mike",
    agent: "Mike Sorrentino",
    origin_city: "Troutman",
    origin_state: "NC",
    destination_city: "Laredo",
    destination_state: "TX",
    shipper_name: "C R Onsrud",
    receiver_name: `Buyer ${i}`,
  }));

describe("customerEndOf", () => {
  it("reads a missing, null or unknown mark as shipper — an old row behaves as it did", () => {
    expect(customerEndOf({})).toBe("shipper");
    expect(customerEndOf({ customer_end: null })).toBe("shipper");
    expect(customerEndOf({ customer_end: "shipper" })).toBe("shipper");
  });

  it("returns the mark that is saved", () => {
    expect(customerEndOf({ customer_end: "receiver" })).toBe("receiver");
    expect(customerEndOf({ customer_end: "neither" })).toBe("neither");
  });
});

describe("footprintPoint — all three ends", () => {
  it("shipper (and un-marked) puts the ORIGIN on the footprint", () => {
    expect(footprintPoint(atlanta())).toEqual({ city: "Atlanta", state: "GA" });
    expect(footprintPoint(atlanta({ customer_end: "shipper" }))).toEqual({ city: "Atlanta", state: "GA" });
  });

  it("receiver puts the DESTINATION on the footprint — 2543056 keeps Troutman, drops Atlanta", () => {
    expect(footprintPoint(atlanta({ customer_end: "receiver" }))).toEqual({ city: "Troutman", state: "NC" });
  });

  it("neither contributes no point at all", () => {
    expect(footprintPoint(atlanta({ customer_end: "neither" }))).toBeNull();
  });

  it("is null when the end it points at has no city or no state", () => {
    expect(footprintPoint({ origin_city: "Atlanta" })).toBeNull();
    expect(footprintPoint({ origin_state: "GA" })).toBeNull();
    expect(footprintPoint({ customer_end: "receiver", destination_city: "Troutman" })).toBeNull();
    expect(footprintPoint({})).toBeNull();
  });

  it("trims what it stores", () => {
    expect(footprintPoint({ origin_city: "  Atlanta ", origin_state: " GA " })).toEqual({
      city: "Atlanta",
      state: "GA",
    });
    expect(footprintPoint({ origin_city: "   ", origin_state: "GA" })).toBeNull();
  });
});

describe("partyLabel", () => {
  it("names the party on each end", () => {
    expect(partyLabel(atlanta(), "shipper")).toBe("Shipper · Marshalling Yard");
    expect(partyLabel(atlanta(), "receiver")).toBe("Receiver · C R Onsrud");
    expect(partyLabel(atlanta(), "neither")).toBe("Neither");
  });

  it("falls back to the city when the party has no name on file", () => {
    expect(partyLabel(atlanta({ shipper_name: null }), "shipper")).toBe("Shipper · Atlanta, GA");
    expect(partyLabel(atlanta({ receiver_name: "  " }), "receiver")).toBe("Receiver · Troutman, NC");
  });

  it("falls back to the bare word when there is neither a name nor a city", () => {
    expect(partyLabel({}, "shipper")).toBe("Shipper");
    expect(partyLabel({}, "receiver")).toBe("Receiver");
  });
});

describe("suggestCustomerEnd — dash suggests, a person decides", () => {
  it("the Atlanta case: the receiver recurs on the agent's other loads → suggest Receiver", () => {
    const s = suggestCustomerEnd(atlanta(), troutmanLoads());
    expect(s).not.toBeNull();
    expect(s?.end).toBe("receiver");
    expect(s?.why).toBe(
      "C R Onsrud is the shipper on 5 other loads with Mike — this one is theirs coming home." +
        " Marked Receiver; Mike's footprint keeps Troutman, NC and drops Atlanta, GA.",
    );
  });

  it("one other load reads in the singular", () => {
    const s = suggestCustomerEnd(atlanta(), troutmanLoads(1));
    expect(s?.why).toBe(
      "C R Onsrud is the shipper on 1 other load with Mike — this one is theirs coming home." +
        " Marked Receiver; Mike's footprint keeps Troutman, NC and drops Atlanta, GA.",
    );
  });

  it("matches loosely — case, punctuation and doubled spaces don't break the tie", () => {
    const s = suggestCustomerEnd(
      atlanta({ receiver_name: "C.R.  ONSRUD" }),
      troutmanLoads(2),
    );
    expect(s?.end).toBe("receiver");
  });

  it("counts a name that recurs on the RECEIVING end and says so", () => {
    const others = troutmanLoads(2).map((l) => ({
      ...l,
      shipper_name: "Somebody Else",
      receiver_name: "C R Onsrud",
    }));
    const s = suggestCustomerEnd(atlanta(), others);
    expect(s?.why).toBe(
      "C R Onsrud is the receiver on 2 other loads with Mike — this one is theirs coming home." +
        " Marked Receiver; Mike's footprint keeps Troutman, NC and drops Atlanta, GA.",
    );
  });

  // The sentence has to name the role the COUNT belongs to. C R Onsrud
  // receives on 4 of Mike's loads and ships on 1: "the shipper on 5 other
  // loads" was a majority role wearing the total, and both halves were wrong.
  it("a mixed-role name reports the majority role with ITS own count", () => {
    const receiving = troutmanLoads(4).map((l) => ({
      ...l,
      shipper_name: "Somebody Else",
      receiver_name: "C R Onsrud",
    }));
    const shipping = troutmanLoads(1).map((l) => ({ ...l, load_id: "S0" }));
    const s = suggestCustomerEnd(atlanta(), [...receiving, ...shipping]);
    expect(s?.end).toBe("receiver");
    expect(s?.why).toContain("is the receiver on 4 other loads");
    expect(s?.why).not.toContain("5 other loads");
  });

  it("the consequence clause says which city the footprint gains and which it loses", () => {
    const s = suggestCustomerEnd(atlanta(), troutmanLoads(2));
    expect(s?.why).toContain("Marked Receiver; Mike's footprint keeps Troutman, NC and drops Atlanta, GA.");
    // ... and it is dropped, not half-written, when the other end has no place.
    const noOrigin = suggestCustomerEnd(
      atlanta({ origin_city: null, origin_state: null }),
      troutmanLoads(2),
    );
    expect(noOrigin?.why).toContain("Marked Receiver; Mike's footprint keeps Troutman, NC.");
    expect(noOrigin?.why).not.toContain("drops");
  });

  it("the mirror: the shipper recurs and the receiver doesn't → suggest Shipper", () => {
    const load = atlanta({ customer_end: "receiver" });
    const others = troutmanLoads(3).map((l) => ({
      ...l,
      shipper_name: "Marshalling Yard",
      receiver_name: "Someone New",
    }));
    const s = suggestCustomerEnd(load, others);
    expect(s?.end).toBe("shipper");
    expect(s?.why).toBe(
      "Marshalling Yard is the shipper on 3 other loads with Mike — the origin is their market." +
        " Marked Shipper; Mike's footprint keeps Atlanta, GA and drops Troutman, NC.",
    );
  });

  it("the negative: nothing recurs → no suggestion", () => {
    const others = troutmanLoads(3).map((l, i) => ({
      ...l,
      shipper_name: `Stranger ${i}`,
      receiver_name: `Consignee ${i}`,
    }));
    expect(suggestCustomerEnd(atlanta(), others)).toBeNull();
  });

  it("the tie: both ends recur → no suggestion, because the evidence is a wash", () => {
    const others = troutmanLoads(2).map((l) => ({
      ...l,
      shipper_name: "C R Onsrud",
      receiver_name: "Marshalling Yard",
    }));
    expect(suggestCustomerEnd(atlanta(), others)).toBeNull();
  });

  it("already marked that way → null, there is nothing to offer", () => {
    expect(suggestCustomerEnd(atlanta({ customer_end: "receiver" }), troutmanLoads())).toBeNull();
  });

  it("a marked 'neither' still hears the suggestion", () => {
    const s = suggestCustomerEnd(atlanta({ customer_end: "neither" }), troutmanLoads());
    expect(s?.end).toBe("receiver");
  });

  it("missing names on this load, or on the others, suggest nothing", () => {
    expect(suggestCustomerEnd(atlanta({ receiver_name: null, shipper_name: null }), troutmanLoads())).toBeNull();
    const nameless = troutmanLoads(3).map((l) => ({ ...l, shipper_name: null, receiver_name: null }));
    expect(suggestCustomerEnd(atlanta(), nameless)).toBeNull();
  });

  it("the same name on BOTH ends of this load proves nothing", () => {
    const load = atlanta({ shipper_name: "C R Onsrud", customer_end: "neither" });
    expect(suggestCustomerEnd(load, troutmanLoads())).toBeNull();
  });

  it("an empty history — and the load's own row — never count", () => {
    expect(suggestCustomerEnd(atlanta(), [])).toBeNull();
    expect(suggestCustomerEnd(atlanta(), [atlanta()])).toBeNull(); // itself, by load_id
  });

  // Rows without ids used to wipe out the whole field: `undefined !== undefined`
  // is false, so EVERY sibling read as "this load" and nothing was left to
  // reason from. Identity is the fallback, and it excludes exactly one row.
  it("excludes the load itself by reference when the rows carry no ids", () => {
    const self: CustomerEndLoadLike = { ...atlanta(), load_id: undefined };
    const others = troutmanLoads(2).map((l) => ({ ...l, load_id: undefined }));
    const s = suggestCustomerEnd(self, [self, ...others]);
    expect(s?.end).toBe("receiver");
    expect(s?.why).toContain("is the shipper on 2 other loads");
  });

  it("loads belonging to another agent are ignored", () => {
    const theirs = troutmanLoads(4).map((l) => ({ ...l, agent_id: "someone-else" }));
    expect(suggestCustomerEnd(atlanta(), theirs)).toBeNull();
  });

  it("falls back to a plain subject when the agent's name is missing", () => {
    const s = suggestCustomerEnd(atlanta({ agent: null }), troutmanLoads(1));
    expect(s?.why).toContain("with this agent —");
  });
});
