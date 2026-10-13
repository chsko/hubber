import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("retention", () => {
  it("deletes old push bookkeeping, handled reports and rate-limit rows, and keeps the rest", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Kari" }));
    const seed = (status: "open" | "resolved") =>
      t.run(async (ctx) => {
        await ctx.db.insert("notifications", { userId, kind: "mention", refId: "m" });
        await ctx.db.insert("reports", {
          reporterId: userId,
          targetType: "user",
          targetId: userId,
          reason: "spam",
          status,
        });
        await ctx.db.insert("rateLimits", {
          key: `k:${status}`,
          windowStart: Date.now(),
          count: 1,
        });
      });
    await seed("resolved");
    await seed("open");
    vi.advanceTimersByTime(400 * DAY_MS);
    await seed("resolved");

    expect(await t.mutation(internal.retention.purge, {})).toBe(5);
    const left = await t.run(async (ctx) => ({
      notifications: (await ctx.db.query("notifications").collect()).length,
      reports: (await ctx.db.query("reports").collect()).map((r) => r.status),
      rateLimits: (await ctx.db.query("rateLimits").collect()).length,
    }));
    expect(left).toEqual({ notifications: 1, reports: ["open", "resolved"], rateLimits: 1 });
  });
});
