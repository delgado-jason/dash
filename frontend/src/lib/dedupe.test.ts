import { describe, it, expect, vi } from "vitest";
import { dedupe } from "./dedupe";

describe("dedupe", () => {
  it("collapses a concurrent burst into a single call", async () => {
    const fn = vi.fn(async () => "value");

    const results = await Promise.all([
      dedupe("k", fn),
      dedupe("k", fn),
      dedupe("k", fn),
    ]);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(results).toEqual(["value", "value", "value"]);
  });

  it("refetches once the previous call has settled — it is not a cache", async () => {
    let n = 0;
    const fn = vi.fn(async () => ++n);

    expect(await dedupe("fresh", fn)).toBe(1);
    expect(await dedupe("fresh", fn)).toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("keeps different keys independent", async () => {
    const a = vi.fn(async () => "a");
    const b = vi.fn(async () => "b");

    const [ra, rb] = await Promise.all([dedupe("a", a), dedupe("b", b)]);

    expect([ra, rb]).toEqual(["a", "b"]);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("delivers a rejection to every caller in the burst", async () => {
    const fn = vi.fn(async () => {
      throw new Error("boom");
    });

    const settled = await Promise.allSettled([
      dedupe("bad", fn),
      dedupe("bad", fn),
    ]);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(settled.every((s) => s.status === "rejected")).toBe(true);
  });

  it("recovers after a failure instead of caching the error", async () => {
    let first = true;
    const fn = vi.fn(async () => {
      if (first) {
        first = false;
        throw new Error("boom");
      }
      return "ok";
    });

    await expect(dedupe("retry", fn)).rejects.toThrow("boom");
    await expect(dedupe("retry", fn)).resolves.toBe("ok");
  });
});
