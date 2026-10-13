import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/**
 * Everyone `userId` has blocked or been blocked by (HUB-33). Blocking works
 * both ways: neither sees the other's messages, mentions or notifications.
 */
export async function blockedWith(ctx: QueryCtx, userId: Id<"users">): Promise<Set<Id<"users">>> {
  const [mine, theirs] = await Promise.all([
    ctx.db
      .query("blocks")
      .withIndex("by_blocker", (q) => q.eq("blockerId", userId))
      .collect(),
    ctx.db
      .query("blocks")
      .withIndex("by_blocked", (q) => q.eq("blockedId", userId))
      .collect(),
  ]);
  return new Set([...mine.map((b) => b.blockedId), ...theirs.map((b) => b.blockerId)]);
}
