import { test } from "node:test";
import assert from "node:assert/strict";
import { getAllSettlementLines } from "./settlementServices.js";

test("getAllSettlementLines refuses a missing user_id before touching the database", async () => {
  await assert.rejects(() => getAllSettlementLines(undefined), (err) => err.type === "validation" && /user_id/.test(err.message));
});
