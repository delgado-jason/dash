import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { getAllAccessorials } from "./accessorialServices.js";

// The guard runs before any database work, so this never touches a pool.
describe("getAllAccessorials — scoped to an account", () => {
  test("a missing user_id is refused before any query", async () => {
    await assert.rejects(getAllAccessorials(undefined), /Missing user_id/);
  });
});
