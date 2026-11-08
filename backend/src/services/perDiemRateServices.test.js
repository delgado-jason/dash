import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listPerDiemRates,
  createPerDiemRate,
  updatePerDiemRate,
  deletePerDiemRate,
} from "./perDiemRateServices.js";

const refuses = (fn, re) => assert.rejects(fn, (e) => e.type === "validation" && re.test(e.message));

test("every rate call refuses a missing user_id before touching the database", async () => {
  await refuses(() => listPerDiemRates(undefined), /user_id/);
  await refuses(() => createPerDiemRate(undefined, { effective_from: "2026-10-01", rate: 86 }), /user_id/);
  await refuses(() => updatePerDiemRate(undefined, "r1", { note: "x" }), /user_id/);
  await refuses(() => deletePerDiemRate(undefined, "r1"), /user_id/);
});

test("update and delete refuse a missing rate_id", async () => {
  await refuses(() => updatePerDiemRate("u1", undefined, { note: "x" }), /rate_id/);
  await refuses(() => deletePerDiemRate("u1", undefined), /rate_id/);
});

test("create refuses an invalid row with the sentence, before the database", async () => {
  await assert.rejects(
    () => createPerDiemRate("u1", { effective_from: "2026-02-30", rate: 86 }),
    (e) => e.type === "validation" && /calendar day/.test(e.message),
  );
});

test("update refuses an invalid patch before the database", async () => {
  await refuses(() => updatePerDiemRate("u1", "r1", { rate: 0 }), /between \$1 and \$500/);
});
