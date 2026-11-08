import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listSettlementSplits,
  createSettlementSplit,
  updateSettlementSplit,
  deleteSettlementSplit,
} from "./settlementSplitServices.js";
import { validSplit } from "../contracts/fixtures.js";

const refuses = (fn, re) => assert.rejects(fn, (e) => e.type === "validation" && re.test(e.message));
const row = validSplit();

test("every split call refuses a missing user_id before touching the database", async () => {
  await refuses(() => listSettlementSplits(undefined), /user_id/);
  await refuses(() => createSettlementSplit(undefined, row), /user_id/);
  await refuses(() => updateSettlementSplit(undefined, "s1", { note: "x" }), /user_id/);
  await refuses(() => deleteSettlementSplit(undefined, "s1"), /user_id/);
});

test("update and delete refuse a missing split_id", async () => {
  await refuses(() => updateSettlementSplit("u1", undefined, { note: "x" }), /split_id/);
  await refuses(() => deleteSettlementSplit("u1", undefined), /split_id/);
});

test("create refuses an invalid row with the sentence, before the database", async () => {
  await refuses(() => createSettlementSplit("u1", { ...row, effective_from: "2026-02-30" }), /calendar day/);
  await refuses(() => createSettlementSplit("u1", { ...row, fuel_surcharge_pct: "" }), /fuel_surcharge_pct must be a fraction 0–1/);
  await refuses(() => createSettlementSplit("u1", { ...row, trailer_pct: 0.4 }), /add to more than 1/);
});

test("update refuses an invalid or empty patch before the database", async () => {
  await refuses(() => updateSettlementSplit("u1", "s1", { accessorial_pct: 1.2 }), /accessorial_pct must be a fraction 0–1/);
  await refuses(() => updateSettlementSplit("u1", "s1", {}), /Nothing to update/);
});
