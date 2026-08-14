import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeMarketName,
  validateMarketCreate,
} from "./marketValidation.js";

describe("normalizeMarketName", () => {
  test("trims leading and trailing whitespace", () => {
    assert.equal(normalizeMarketName("  Atlanta Market  "), "Atlanta Market");
  });

  test("trims a lone trailing space (the real duplicate-causing bug)", () => {
    assert.equal(normalizeMarketName("Atlanta Market "), "Atlanta Market");
  });

  test("collapses internal whitespace runs", () => {
    assert.equal(normalizeMarketName("Baton   Rouge  Market"), "Baton Rouge Market");
  });

  test("appends 'Market' when the word is missing entirely", () => {
    assert.equal(normalizeMarketName("Las Vegas"), "Las Vegas Market");
  });

  test("does not append when 'Market' is already present (case-insensitive)", () => {
    assert.equal(normalizeMarketName("dallas market"), "dallas market");
    assert.equal(normalizeMarketName("Dallas Market"), "Dallas Market");
  });

  test("does not double-append on a name that already ends in Market", () => {
    assert.equal(normalizeMarketName("Charlotte Market"), "Charlotte Market");
  });

  test("handles regional-style names that already carry Market", () => {
    assert.equal(
      normalizeMarketName("Eastern Kentucky Market "),
      "Eastern Kentucky Market",
    );
  });

  test("leaves punctuated city names alone when Market is present", () => {
    assert.equal(normalizeMarketName("D.C. Market"), "D.C. Market");
  });

  test("collapses tab/newline whitespace, no trailing space left", () => {
    assert.equal(normalizeMarketName("Atlanta Market\t"), "Atlanta Market");
    assert.equal(normalizeMarketName("Baton\tRouge\nMarket"), "Baton Rouge Market");
  });

  test("anchors the append to a trailing token (does not maul 'Newmarket')", () => {
    // "Newmarket" ends in "market", so the append is suppressed -> stays as-is,
    // instead of the \bmarket\b bug that produced "Newmarket Market".
    assert.equal(normalizeMarketName("Newmarket"), "Newmarket");
    assert.equal(normalizeMarketName("Newmarket Market"), "Newmarket Market");
  });

  test("blank / whitespace-only collapses to empty (so validation can reject)", () => {
    assert.equal(normalizeMarketName("   "), "");
    assert.equal(normalizeMarketName(""), "");
  });

  test("passes non-strings through untouched", () => {
    assert.equal(normalizeMarketName(null), null);
    assert.equal(normalizeMarketName(undefined), undefined);
    assert.equal(normalizeMarketName(42), 42);
  });
});

describe("normalize + validate together", () => {
  test("a city-only name normalizes and then validates clean", () => {
    const data = { market_name: normalizeMarketName("Las Vegas") };
    assert.equal(data.market_name, "Las Vegas Market");
    assert.deepEqual(validateMarketCreate(data), []);
  });

  test("a whitespace-only name normalizes to blank and is rejected", () => {
    const data = { market_name: normalizeMarketName("   ") };
    const errors = validateMarketCreate(data);
    assert.ok(errors.length > 0);
    assert.ok(errors.includes("Missing market_name"));
  });

  test("a name that overflows varchar(50) after normalization is rejected", () => {
    const data = { market_name: normalizeMarketName("A".repeat(45)) };
    assert.equal(data.market_name.length, 52); // 45 + " Market"
    const errors = validateMarketCreate(data);
    assert.ok(errors.some((e) => /50 characters or fewer/.test(e)));
  });
});
