import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import { getHubMember } from "./lib/auth";
import { getConversationAccess, requireConversationAccess } from "./lib/conversations";

/** Long enough for a proper message to the class, short enough to stay a chat. */
export const MAX_MESSAGE_LENGTH = 4000;

type Author = { _id: Id<"users">; name: string | null; photoUrl: string | null };

/** Looks up each author once per page. Deleted accounts show as name null. */
function authorLoader(ctx: QueryCtx) {
  const cache = new Map<Id<"users">, Promise<Author>>();
  return (userId: Id<"users">) => {
    let author = cache.get(userId);
    if (author === undefined) {
      author = (async () => {
        const user = await ctx.db.get(userId);
        const gone = user === null || user.deletedAt !== undefined;
        return {
          _id: userId,
          name: gone ? null : (user.name ?? null),
          photoUrl: !gone && user.photoId ? await ctx.storage.getUrl(user.photoId) : null,
        };
      })();
      cache.set(userId, author);
    }
    return author;
  };
}

/** The hub's main conversation (created with the hub), or null for non-members. */
export const hubConversation = query({
  args: { hubId: v.id("hubs") },
  handler: async (ctx, args) => {
    if ((await getHubMember(ctx, args.hubId)) === null) return null;
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_hub", (q) => q.eq("hubId", args.hubId))
      .filter((q) => q.eq(q.field("kind"), "hub"))
      .first();
    return conversation?._id ?? null;
  },
});

/**
 * A page of messages, newest first (HUB-18). Live: new messages arrive on
 * their own. Empty for anyone who isn't a member.
 */
export const list = query({
  args: { conversationId: v.id("conversations"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const access = await getConversationAccess(ctx, args.conversationId);
    if (access === null) return { page: [], isDone: true, continueCursor: "" };
    const result = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .paginate(args.paginationOpts);
    const author = authorLoader(ctx);
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (m: Doc<"messages">) => ({
          _id: m._id,
          _creationTime: m._creationTime,
          body: m.deletedAt === undefined ? m.body : "",
          deleted: m.deletedAt !== undefined,
          editedAt: m.editedAt ?? null,
          author: await author(m.authorId),
          isMine: m.authorId === access.user._id,
        })),
      ),
    };
  },
});

/** Sends a text message. Bumps the conversation and the hub's last activity. */
export const send = mutation({
  args: { conversationId: v.id("conversations"), body: v.string() },
  handler: async (ctx, args) => {
    const { user, conversation, hubId } = await requireConversationAccess(ctx, args.conversationId);
    const body = args.body.trim();
    if (body.length === 0 || body.length > MAX_MESSAGE_LENGTH) {
      throw new ConvexError({ code: "INVALID_MESSAGE" });
    }
    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      conversationId: conversation._id,
      authorId: user._id,
      body,
      imageIds: [],
      mentions: [],
    });
    await ctx.db.patch(conversation._id, { lastMessageAt: now });
    await ctx.db.patch(hubId, { lastActivityAt: now });
    return messageId;
  },
});
