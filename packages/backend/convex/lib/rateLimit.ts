import type { MutationCtx } from "../_generated/server";

/**
 * Fixed-window rate limit. Counts one hit for `key` and returns false once
 * more than `max` hits land within `windowMs`. Callers must not throw after a
 * refused hit, or the counter rolls back with the transaction.
 */
export async function hitRateLimit(
  ctx: MutationCtx,
  key: string,
  { max, windowMs }: { max: number; windowMs: number },
): Promise<boolean> {
  const now = Date.now();
  const row = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (row === null) {
    await ctx.db.insert("rateLimits", { key, windowStart: now, count: 1 });
    return true;
  }
  if (now - row.windowStart >= windowMs) {
    await ctx.db.patch(row._id, { windowStart: now, count: 1 });
    return true;
  }
  await ctx.db.patch(row._id, { count: row.count + 1 });
  return row.count + 1 <= max;
}

/** Whether `key` has already used up its `max` hits in the current window, without counting one. */
export async function isRateLimited(
  ctx: MutationCtx,
  key: string,
  { max, windowMs }: { max: number; windowMs: number },
): Promise<boolean> {
  const row = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  return row !== null && Date.now() - row.windowStart < windowMs && row.count >= max;
}
