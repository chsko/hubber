import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, type MutationCtx, query } from "./_generated/server";
import { getUserId, requireUser } from "./lib/auth";

/**
 * Self-service account deletion (HUB-13), for GDPR and the app stores.
 * Personal data goes; messages stay in their chats as "Deleted user".
 * Hubs you own need a new owner first, unless you're alone in them, in
 * which case they're closed and deleted with everything in them.
 */

/** Rows deleted per run when closing a hub; the rest is rescheduled. */
const BATCH = 200;

async function activeOthers(ctx: MutationCtx, hubId: Id<"hubs">, userId: Id<"users">) {
  const members = await ctx.db
    .query("hubMembers")
    .withIndex("by_hub", (q) => q.eq("hubId", hubId))
    .collect();
  return members.filter((m) => m.status === "active" && m.userId !== userId).length;
}

/**
 * What deleting the account would do: hubs that need a new owner first
 * (others are in them), and hubs that would be closed (only you).
 */
export const deletionCheck = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (userId === null) return null;
    const owned = await ctx.db
      .query("hubMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const needOwner: { _id: Id<"hubs">; name: string }[] = [];
    const willClose: { _id: Id<"hubs">; name: string }[] = [];
    for (const m of owned) {
      if (m.role !== "owner") continue;
      const hub = await ctx.db.get(m.hubId);
      if (hub === null) continue;
      const members = await ctx.db
        .query("hubMembers")
        .withIndex("by_hub", (q) => q.eq("hubId", hub._id))
        .collect();
      const others = members.filter((x) => x.status === "active" && x.userId !== userId).length;
      (others > 0 ? needOwner : willClose).push({ _id: hub._id, name: hub.name });
    }
    return { needOwner, willClose };
  },
});

/** Deletes the signed-in user's account. Throws OWNS_HUBS while hubs still need a new owner. */
export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const userId = user._id;
    const memberships = await ctx.db
      .query("hubMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const m of memberships) {
      if (m.role === "owner" && (await activeOthers(ctx, m.hubId, userId)) > 0) {
        throw new ConvexError({ code: "OWNS_HUBS" });
      }
    }
    for (const m of memberships) {
      await ctx.db.delete(m._id);
      if (m.role === "owner") {
        await ctx.scheduler.runAfter(0, internal.account.closeHub, { hubId: m.hubId });
      }
    }

    // Everything personal that isn't content in someone else's chat.
    const rows = [
      ...(await ctx.db
        .query("rsvps")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()),
      ...(await ctx.db
        .query("readStates")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()),
      ...(await ctx.db
        .query("pushTokens")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()),
      ...(await ctx.db
        .query("calendarFeeds")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()),
      ...(await ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()),
      ...(await ctx.db
        .query("reactions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()),
      ...(await ctx.db
        .query("blocks")
        .withIndex("by_blocker", (q) => q.eq("blockerId", userId))
        .collect()),
      ...(await ctx.db
        .query("blocks")
        .withIndex("by_blocked", (q) => q.eq("blockedId", userId))
        .collect()),
    ];
    for (const row of rows) await ctx.db.delete(row._id);

    // Sign-in: accounts, sessions and their refresh tokens, so Vipps starts afresh.
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    for (const account of accounts) {
      const codes = await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", account._id))
        .collect();
      for (const code of codes) await ctx.db.delete(code._id);
      await ctx.db.delete(account._id);
    }
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();
    for (const session of sessions) {
      const tokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .collect();
      for (const token of tokens) await ctx.db.delete(token._id);
      await ctx.db.delete(session._id);
    }

    if (user.photoId !== undefined) await ctx.storage.delete(user.photoId);
    // Only the tombstone is left, so messages can say "Deleted user".
    await ctx.db.replace(userId, { deletedAt: Date.now() });
  },
});

/**
 * Deletes a hub that its owner left behind alone, with its chats, events
 * and files, a batch at a time.
 */
export const closeHub = internalMutation({
  args: { hubId: v.id("hubs") },
  handler: async (ctx, args) => {
    let budget = BATCH;
    const remove = async (id: Parameters<typeof ctx.db.delete>[0]) => {
      await ctx.db.delete(id);
      budget -= 1;
    };

    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_hub", (q) => q.eq("hubId", args.hubId))
      .collect();
    const events = await ctx.db
      .query("events")
      .withIndex("by_hub_start", (q) => q.eq("hubId", args.hubId))
      .collect();
    for (const event of events) {
      const chat = await ctx.db
        .query("conversations")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .first();
      if (chat !== null) conversations.push(chat);
    }

    for (const conversation of conversations) {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
        .take(Math.max(budget, 0));
      for (const message of messages) {
        for (const imageId of message.imageIds) await ctx.storage.delete(imageId);
        const reactions = await ctx.db
          .query("reactions")
          .withIndex("by_message", (q) => q.eq("messageId", message._id))
          .collect();
        for (const r of reactions) await remove(r._id);
        await remove(message._id);
      }
      if (budget <= 0) break;
      const reads = await ctx.db
        .query("readStates")
        .withIndex("by_conversation_user", (q) => q.eq("conversationId", conversation._id))
        .collect();
      for (const r of reads) await remove(r._id);
      await remove(conversation._id);
    }
    if (budget <= 0) {
      await ctx.scheduler.runAfter(0, internal.account.closeHub, args);
      return;
    }

    for (const event of events) {
      for (const job of event.reminderJobs ?? []) {
        const scheduled = await ctx.db.system.get(job);
        if (scheduled?.state.kind === "pending") await ctx.scheduler.cancel(job);
      }
      const rsvps = await ctx.db
        .query("rsvps")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .collect();
      for (const r of rsvps) await ctx.db.delete(r._id);
      if (event.coverId !== undefined) await ctx.storage.delete(event.coverId);
      await ctx.db.delete(event._id);
    }
    const leftovers = [
      ...(await ctx.db
        .query("invites")
        .withIndex("by_hub", (q) => q.eq("hubId", args.hubId))
        .collect()),
      ...(await ctx.db
        .query("hubMembers")
        .withIndex("by_hub", (q) => q.eq("hubId", args.hubId))
        .collect()),
    ];
    for (const row of leftovers) await ctx.db.delete(row._id);
    const hub = await ctx.db.get(args.hubId);
    if (hub?.iconId !== undefined) await ctx.storage.delete(hub.iconId);
    if (hub !== null) await ctx.db.delete(hub._id);
  },
});
