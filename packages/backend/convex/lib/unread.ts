import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { blockedWith } from "./blocks";

/** Unread counts are shown as "99+" beyond this, so counting stops there. */
export const UNREAD_CAP = 100;

/**
 * When `userId` last read `conversationId`. Without a read state, it's when
 * they joined, so a new member doesn't start with the whole history unread.
 */
export async function lastReadAt(
  ctx: QueryCtx,
  conversationId: Id<"conversations">,
  userId: Id<"users">,
  joinedAt: number,
): Promise<number> {
  const state = await ctx.db
    .query("readStates")
    .withIndex("by_conversation_user", (q) =>
      q.eq("conversationId", conversationId).eq("userId", userId),
    )
    .unique();
  return state?.lastReadAt ?? joinedAt;
}

/** Messages from others since `since`, not deleted or from blocked people, up to UNREAD_CAP. */
export async function unreadCount(
  ctx: QueryCtx,
  conversationId: Id<"conversations">,
  userId: Id<"users">,
  since: number,
): Promise<number> {
  const recent = await ctx.db
    .query("messages")
    .withIndex("by_conversation", (q) =>
      q.eq("conversationId", conversationId).gt("_creationTime", since),
    )
    .take(UNREAD_CAP);
  if (recent.length === 0) return 0;
  const blocked = await blockedWith(ctx, userId);
  return recent.filter(
    (m: Doc<"messages">) =>
      m.authorId !== userId && m.deletedAt === undefined && !blocked.has(m.authorId),
  ).length;
}
