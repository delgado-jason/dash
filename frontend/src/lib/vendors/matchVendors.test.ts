import { describe, it, expect } from "vitest";
import { matchVendors } from "./matchVendors";
import type { Vendor } from "@/types/vendor";

const v = (name: string, aliases: string[] = []): Vendor => ({
  vendor_id: name,
  name,
  aliases,
  category: "Shop",
  status: "active",
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
});

const ROLODEX = [
  v("Thermo King"),
  v("Ray's Tire Service", ["Rays Tire Shop"]),
  v("TA Petro"),
];

const names = (text: string) =>
  matchVendors(text, ROLODEX).map((m) => `${m.vendor.name}|${m.alias ?? ""}`);

describe("matchVendors — what the vendor box offers", () => {
  it("matches the name, case-insensitively, with no alias to show", () => {
    expect(names("therm")).toEqual(["Thermo King|"]);
    expect(names("KING")).toEqual(["Thermo King|"]);
  });

  it("matches an alias and reports WHICH alias hit", () => {
    expect(names("rays tire shop")).toEqual(["Ray's Tire Service|Rays Tire Shop"]);
  });

  it("the name wins over the alias when both could match", () => {
    expect(names("tire")).toEqual(["Ray's Tire Service|"]);
  });

  it("empty text offers the whole rolodex, ordered by name", () => {
    expect(names("")).toEqual(["Ray's Tire Service|", "TA Petro|", "Thermo King|"]);
    expect(names("   ")).toEqual(["Ray's Tire Service|", "TA Petro|", "Thermo King|"]);
  });

  it("no match is an empty list", () => {
    expect(names("cummins")).toEqual([]);
  });

  it("the list is capped", () => {
    const many = Array.from({ length: 20 }, (_, i) => v(`Shop ${String(i).padStart(2, "0")}`));
    expect(matchVendors("shop", many).length).toBe(8);
    expect(matchVendors("shop", many, 3).map((m) => m.vendor.name)).toEqual([
      "Shop 00",
      "Shop 01",
      "Shop 02",
    ]);
  });
});
