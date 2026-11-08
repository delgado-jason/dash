import { test } from "node:test";
import assert from "node:assert/strict";
import { listFscSchedules, createFscSchedule, deleteFscSchedule } from "./fscScheduleServices.js";

const refuses = (fn, re) => assert.rejects(fn, (e) => e.type === "validation" && re.test(e.message));
const good = { effective_from: "2026-11-01", bands: [{ low: 4, high: 4.049, cpm: 0.58 }, { low: 4.05, high: null, cpm: 0.6 }] };

test("every call refuses a missing user_id before the database", async () => {
  await refuses(() => listFscSchedules(undefined), /user_id/);
  await refuses(() => createFscSchedule(undefined, good), /user_id/);
  await refuses(() => deleteFscSchedule(undefined, "s1"), /user_id/);
});
test("delete refuses a missing schedule_id", () => refuses(() => deleteFscSchedule("u1", undefined), /schedule_id/));
test("create refuses an invalid table with the sentence, before the database", async () => {
  await refuses(() => createFscSchedule("u1", { ...good, effective_from: "2026-02-30" }), /calendar day/);
  await refuses(() => createFscSchedule("u1", { ...good, bands: [good.bands[0]] }), /at least two bands/);
});
