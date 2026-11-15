import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import { haulSentence, haulShape, tally, countWord } from "./haul";

const load = (p: Partial<Load>): Load =>
  ({
    load_id: p.load_number ?? "x",
    load_number: "x",
    load_status: "delivered",
    load_type: "standard flatbed",
    origin_city: "Carlisle",
    origin_state: "PA",
    destination_city: "Roanoke",
    destination_state: "VA",
    shipper_name: "Carlisle Syntec",
    pickup_date: "2026-04-16",
    delivery_date: "2026-04-17",
    ...p,
  }) as unknown as Load;

describe("haulSentence", () => {
  it("one shipper, one origin — Eric Hesketh's file, typo and all", () => {
    const loads = [
      load({ load_number: "1", load_type: "hazmat", shipper_name: "Carlisle Syntec" }),
      load({ load_number: "2", load_type: "hazmat", shipper_name: "Carlise Syntec", load_status: "cancelled" }),
      load({ load_number: "3", load_type: "hazmat", shipper_name: "Carlise Syntec" }),
      load({ load_number: "4", load_type: "hazmat", shipper_name: "Carlise Syntec" }),
      load({ load_number: "5", load_type: "hazmat", shipper_name: "Carlisle Syntec " }),
    ];
    expect(haulSentence(loads)).toBe(
      "Hazmat out of Carlisle, PA — all five loads from Carlise Syntec. One shipper, one origin: a customer with a lane, not a spot desk.",
    );
  });

  it("a TONU is not a load and is not counted", () => {
    const loads = [
      load({ load_number: "1", load_type: "oversize" }),
      load({ load_number: "2", load_type: "oversize" }),
      load({ load_number: "3", load_type: "hazmat", load_status: "tonu", shipper_name: "Someone Else" }),
    ];
    expect(haulShape(loads).loads).toBe(2);
    expect(haulSentence(loads)).toBe(
      "Oversize out of Carlisle, PA — all two loads from Carlisle Syntec. One shipper, one origin: a customer with a lane, not a spot desk.",
    );
  });

  it("two types, two origins, a spot desk", () => {
    const loads = [
      load({ load_number: "1", load_type: "oversize", origin_city: "Mobile", origin_state: "AL", shipper_name: "A Co" }),
      load({ load_number: "2", load_type: "standard flatbed", origin_city: "Birmingham", origin_state: "AL", shipper_name: "B Co" }),
      load({ load_number: "3", load_type: "oversize", origin_city: "Mobile", origin_state: "AL", shipper_name: "C Co" }),
    ];
    expect(haulSentence(loads)).toBe(
      "Mostly oversize (2 of 3) out of Mobile, AL and Birmingham, AL, standard flatbed too — three loads, three shippers. Every named load a different shipper: a spot desk.",
    );
  });

  it("many cities, a repeat customer among others", () => {
    const loads = [1, 2, 3, 4, 5, 6].map((i) =>
      load({
        load_number: String(i),
        load_type: i % 2 ? "oversize" : "hazmat",
        origin_city: ["Houston", "Dallas", "Houston", "Tulsa", "Austin", "Waco"][i - 1],
        origin_state: "TX",
        shipper_name: i <= 3 ? "Jet Midwest" : `Shipper ${i}`,
      }),
    );
    expect(haulSentence(loads)).toBe(
      "Hazmat and oversize out of five cities, Houston, TX most — three of six from Jet Midwest. Mostly one customer, with others around it.",
    );
  });

  it("no shipper on record says so", () => {
    const loads = [
      load({ load_number: "1", shipper_name: null }),
      load({ load_number: "2", shipper_name: "" }),
    ];
    expect(haulSentence(loads)).toBe("Standard flatbed out of Carlisle, PA — no shipper on record.");
  });

  it("the unnamed loads are said, and no verdict is guessed from a minority — Mike's seed file", () => {
    const loads = [1, 2, 3, 4, 5, 6].map((i) =>
      load({
        load_number: String(i),
        origin_city: "Houston",
        origin_state: "TX",
        shipper_name: i === 1 ? "A Co" : i === 2 ? "B Co" : null,
      }),
    );
    expect(haulSentence(loads)).toBe(
      "Standard flatbed out of Houston, TX — two loads, two shippers, four with no shipper on record.",
    );
    const oneNamed = loads.map((l, i) => (i === 1 ? load({ ...l, shipper_name: null }) : l));
    expect(haulSentence(oneNamed)).toBe(
      "Standard flatbed out of Houston, TX — A Co on one of six, five with no shipper on record.",
    );
  });

  it("a customer wherever a shipper is named, half named", () => {
    const loads = [1, 2, 3, 4].map((i) =>
      load({ load_number: String(i), shipper_name: i <= 2 ? "Carlisle Syntec" : null }),
    );
    expect(haulSentence(loads)).toBe(
      "Standard flatbed out of Carlisle, PA — Carlisle Syntec on two of four, two with no shipper on record. One shipper wherever one is named: a customer, not a spot desk.",
    );
  });

  it("one load is not a pattern", () => {
    expect(haulSentence([load({})])).toBeNull();
    expect(haulSentence([])).toBeNull();
  });
});

describe("tally", () => {
  it("counts most common first and keeps the majority spelling", () => {
    const t = tally(
      [
        { key: "a", label: "A" },
        { key: "b", label: "B" },
        { key: "a", label: "a" },
        { key: "a", label: "A" },
      ],
      false,
    );
    expect(t.map((x) => [x.label, x.n])).toEqual([
      ["A", 3],
      ["B", 1],
    ]);
  });

  it("folds a one-letter typo only when fuzzy and the name is long enough", () => {
    const items = [
      { key: "carlisle syntec", label: "Carlisle Syntec" },
      { key: "carlise syntec", label: "Carlise Syntec" },
      { key: "ab", label: "ab" },
      { key: "ac", label: "ac" },
    ];
    expect(tally(items, true).map((x) => x.n)).toEqual([2, 1, 1]);
    expect(tally(items, false).map((x) => x.n)).toEqual([1, 1, 1, 1]);
  });
});

describe("countWord", () => {
  it("words to twelve, digits after", () => {
    expect(countWord(5)).toBe("five");
    expect(countWord(12)).toBe("twelve");
    expect(countWord(13)).toBe("13");
  });
});
