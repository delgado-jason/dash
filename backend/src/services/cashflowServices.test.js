import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getDepositOverrides,
  setDepositOverride,
  deleteDepositOverride,
} from "./cashflowServices.js";

// The deposit you typed before the statement landed (migration 105). These
// lived in one browser's localStorage until v1.268.0, where nothing could
// validate them at all — a bad key or a nonsense figure just sat there. Now
// they are rows, so the sentence is checked before the database sees it.
const refuses = (fn, re) => assert.rejects(fn, (e) => e.type === "validation" && re.test(e.message));

test("every call refuses a missing user_id before the database", async () => {
  await refuses(() => getDepositOverrides(undefined), /user_id/);
  await refuses(() => setDepositOverride(undefined, { statement_date: "2026-11-11", amount: 100 }), /user_id/);
  await refuses(() => deleteDepositOverride(undefined, "2026-11-11"), /user_id/);
});

test("the key is a statement DATE — the Wednesday the period settles", async () => {
  await refuses(() => setDepositOverride("u1", { statement_date: "2026-11", amount: 100 }), /YYYY-MM-DD/);
  await refuses(() => setDepositOverride("u1", { statement_date: "", amount: 100 }), /YYYY-MM-DD/);
  await refuses(() => setDepositOverride("u1", { amount: 100 }), /YYYY-MM-DD/);
  await refuses(() => deleteDepositOverride("u1", "last wednesday"), /YYYY-MM-DD/);
});

test("a deposit can be nothing but never less than nothing", async () => {
  // A home week's statement nets to zero and lands nothing — that is a real
  // figure to type. A NEGATIVE one is not: Landstar carries a negative
  // statement into the next one rather than taking money back out of the
  // account, so the deposit itself never goes below zero.
  await refuses(() => setDepositOverride("u1", { statement_date: "2026-11-11", amount: -1 }), /zero or more/);
  await refuses(() => setDepositOverride("u1", { statement_date: "2026-11-11", amount: "not a number" }), /zero or more/);
  await refuses(() => setDepositOverride("u1", { statement_date: "2026-11-11" }), /zero or more/);
});
