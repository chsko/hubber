import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getConversationAccess, requireConversationAccess } from "./lib/conversations";

/** Marks the conversation read up to now (HUB-21). Called while the chat is on screen. */
export const markRead = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const { user } = await requireConversationAccess(ctx, args.conversationId);
    const now = Date.now();
    const state = await ctx.db
      .query("readStates")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", user._id),
      )
      .unique();
    if (state === null) {
      await ctx.db.insert("readStates", {
        conversationId: args.conversationId,
        userId: user._id,
        lastReadAt: now,
      });
    } else if (state.lastReadAt < now) {
      await ctx.db.patch(state._id, { lastReadAt: now });
    }
  },
});

/**
 * "Seen by N" for the latest message only (no per-message receipts): how
 * many people other than its author have read up to it.
 */
export const seenBy = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    if ((await getConversationAccess(ctx, args.conversationId)) === null) return null;
    const latest = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .first();
    if (latest === null || latest.deletedAt !== undefined) return null;
    const states = await ctx.db
      .query("readStates")
      .withIndex("by_conversation_user", (q) => q.eq("conversationId", args.conversationId))
      .collect();
    const count = states.filter(
      (s) => s.userId !== latest.authorId && s.lastReadAt >= latest._creationTime,
    ).length;
    return { messageId: latest._id, count };
  },
});
