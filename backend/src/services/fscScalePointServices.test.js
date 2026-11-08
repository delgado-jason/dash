import { test } from "node:test";
import assert from "node:assert/strict";
import { listFscScalePoints, createFscScalePoint, deleteFscScalePoint } from "./fscScalePointServices.js";

const refuses = (fn, re) => assert.rejects(fn, (e) => e.type === "validation" && re.test(e.message));
const good = { week_of: "2026-11-03", national_avg: 6.292, cents_per_mile: 0.86, pct_of_linehaul: 0.52 };

test("every call refuses a missing user_id before the database", async () => {
  await refuses(() => listFscScalePoints(undefined), /user_id/);
  await refuses(() => createFscScalePoint(undefined, good), /user_id/);
  await refuses(() => deleteFscScalePoint(undefined, "p1"), /user_id/);
});
test("delete refuses a missing point_id", () => refuses(() => deleteFscScalePoint("u1", undefined), /point_id/));
test("create refuses an invalid point with the sentence, before the database", async () => {
  await refuses(() => createFscScalePoint("u1", { ...good, week_of: "2026-02-30" }), /calendar day/);
  await refuses(() => createFscScalePoint("u1", { ...good, cents_per_mile: 86 }), /loaded mile/);
  await refuses(() => createFscScalePoint("u1", { ...good, national_avg: "" }), /diesel price/);
});
