import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalQuery,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { getHubMember } from "./lib/auth";
import { getConversationAccess, requireConversationAccess } from "./lib/conversations";
import { requireImage } from "./lib/images";

/** Long enough for a proper message to the class, short enough to stay a chat. */
export const MAX_MESSAGE_LENGTH = 4000;

/** Your own messages can be edited for this long (docs/DESIGN.md §5.4). */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

/** Photos per message (HUB-20). */
export const MAX_IMAGES = 6;

/** Quoted text in a reply is cut to this many characters. */
const QUOTE_LENGTH = 140;

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

function cleanBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new ConvexError({ code: "INVALID_MESSAGE" });
  }
  return trimmed;
}

/** A single emoji (with modifiers or joiners), never free text. */
function cleanEmoji(emoji: string): string {
  if (emoji.length === 0 || emoji.length > 16 || !/^\p{Extended_Pictographic}/u.test(emoji)) {
    throw new ConvexError({ code: "INVALID_EMOJI" });
  }
  return emoji;
}

/** The message plus the caller's access to its conversation. Throws for non-members. */
async function requireMessage(ctx: MutationCtx, messageId: Id<"messages">) {
  const message = await ctx.db.get(messageId);
  if (message === null) throw new ConvexError({ code: "NOT_FOUND" });
  const access = await requireConversationAccess(ctx, message.conversationId);
  return { message, ...access };
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
 * A page of messages, newest first (HUB-18), with reactions, the quoted
 * message for replies and mentioned names (HUB-19). Live: new messages and
 * reactions arrive on their own. Empty for anyone who isn't a member.
 */
export const list = query({
  args: { conversationId: v.id("conversations"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const access = await getConversationAccess(ctx, args.conversationId);
    if (access === null) return { page: [], isDone: true, continueCursor: "" };
    const me = access.user._id;
    const isAdmin = access.role !== "member";
    const result = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .paginate(args.paginationOpts);
    const author = authorLoader(ctx);
    const eventCard = async (eventId: Id<"events"> | undefined) => {
      const event = eventId ? await ctx.db.get(eventId) : null;
      return event === null
        ? null
        : {
            _id: event._id,
            title: event.title,
            startsAt: event.startsAt,
            cancelled: event.cancelledAt !== undefined,
          };
    };

    async function view(m: Doc<"messages">) {
      const deleted = m.deletedAt !== undefined;
      const reactionRows = deleted
        ? []
        : await ctx.db
            .query("reactions")
            .withIndex("by_message", (q) => q.eq("messageId", m._id))
            .collect();
      const reactions = new Map<string, { emoji: string; count: number; mine: boolean }>();
      for (const r of reactionRows) {
        const entry = reactions.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
        entry.count += 1;
        entry.mine ||= r.userId === me;
        reactions.set(r.emoji, entry);
      }
      const quoted = m.replyToId && !deleted ? await ctx.db.get(m.replyToId) : null;
      return {
        _id: m._id,
        _creationTime: m._creationTime,
        body: deleted ? "" : m.body,
        /** Fetch photo i from the `/chat-image` HTTP route, which checks membership. */
        imageCount: deleted ? 0 : m.imageIds.length,
        deleted,
        editedAt: m.editedAt ?? null,
        author: await author(m.authorId),
        isMine: m.authorId === me,
        canDelete: !deleted && (m.authorId === me || isAdmin),
        reactions: [...reactions.values()],
        replyTo: quoted
          ? {
              _id: quoted._id,
              authorName: (await author(quoted.authorId)).name,
              body: quoted.deletedAt === undefined ? quoted.body.slice(0, QUOTE_LENGTH) : "",
              hasImages: quoted.deletedAt === undefined && quoted.imageIds.length > 0,
              deleted: quoted.deletedAt !== undefined,
            }
          : null,
        mentions: deleted
          ? []
          : await Promise.all(
              m.mentions.map(async (id) => ({ _id: id, name: (await author(id)).name })),
            ),
        mentionsMe: !deleted && m.mentions.includes(me),
        event: deleted ? null : await eventCard(m.eventId),
      };
    }

    return { ...result, page: await Promise.all(result.page.map(view)) };
  },
});

/**
 * Sends a text message, optionally as a reply and with @mentions of hub
 * members (HUB-19). Bumps the conversation and the hub's last activity.
 */
export const send = mutation({
  args: {
    conversationId: v.id("conversations"),
    body: v.string(),
    replyToId: v.optional(v.id("messages")),
    mentions: v.optional(v.array(v.id("users"))),
    imageIds: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    const { user, conversation, hubId } = await requireConversationAccess(ctx, args.conversationId);
    const imageIds = [...new Set(args.imageIds ?? [])];
    if (imageIds.length > MAX_IMAGES) throw new ConvexError({ code: "TOO_MANY_IMAGES" });
    for (const id of imageIds) await requireImage(ctx, id);
    // A photo message may have no text.
    const body = imageIds.length > 0 && args.body.trim() === "" ? "" : cleanBody(args.body);

    if (args.replyToId !== undefined) {
      const quoted = await ctx.db.get(args.replyToId);
      if (quoted === null || quoted.conversationId !== conversation._id) {
        throw new ConvexError({ code: "INVALID_REPLY" });
      }
    }
    // Only active members of this hub can be mentioned; others are dropped.
    const mentions: Id<"users">[] = [];
    for (const userId of new Set(args.mentions ?? [])) {
      const member = await ctx.db
        .query("hubMembers")
        .withIndex("by_hub_user", (q) => q.eq("hubId", hubId).eq("userId", userId))
        .unique();
      if (member?.status === "active" && userId !== user._id) mentions.push(userId);
    }

    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      conversationId: conversation._id,
      authorId: user._id,
      body,
      imageIds,
      mentions,
      ...(args.replyToId !== undefined && { replyToId: args.replyToId }),
    });
    await ctx.db.patch(conversation._id, { lastMessageAt: now });
    await ctx.db.patch(hubId, { lastActivityAt: now });
    await ctx.scheduler.runAfter(0, internal.push.onMessage, { messageId });
    return messageId;
  },
});

/** Edit your own message, within 15 minutes of sending it. */
export const edit = mutation({
  args: { messageId: v.id("messages"), body: v.string() },
  handler: async (ctx, args) => {
    const { message, user } = await requireMessage(ctx, args.messageId);
    if (
      message.authorId !== user._id ||
      message.deletedAt !== undefined ||
      message.eventId !== undefined
    ) {
      throw new ConvexError({ code: "FORBIDDEN" });
    }
    if (Date.now() - message._creationTime > EDIT_WINDOW_MS) {
      throw new ConvexError({ code: "EDIT_WINDOW_PASSED" });
    }
    const body = cleanBody(args.body);
    if (body !== message.body) await ctx.db.patch(message._id, { body, editedAt: Date.now() });
  },
});

/**
 * Delete a message: your own any time, or anyone's as a hub admin. The text,
 * mentions and reactions are removed; a "Message deleted" placeholder stays.
 */
export const remove = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const { message, user, role } = await requireMessage(ctx, args.messageId);
    if (message.authorId !== user._id && role === "member") {
      throw new ConvexError({ code: "FORBIDDEN" });
    }
    if (message.deletedAt !== undefined) return;
    await ctx.db.patch(message._id, {
      body: "",
      mentions: [],
      imageIds: [],
      deletedAt: Date.now(),
    });
    for (const id of message.imageIds) await ctx.storage.delete(id);
    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_message", (q) => q.eq("messageId", message._id))
      .collect();
    for (const r of reactions) await ctx.db.delete(r._id);
  },
});

/** Add or take back your emoji reaction on a message. */
export const toggleReaction = mutation({
  args: { messageId: v.id("messages"), emoji: v.string() },
  handler: async (ctx, args) => {
    const { message, user } = await requireMessage(ctx, args.messageId);
    if (message.deletedAt !== undefined) throw new ConvexError({ code: "NOT_FOUND" });
    const emoji = cleanEmoji(args.emoji);
    const mine = await ctx.db
      .query("reactions")
      .withIndex("by_message_user", (q) => q.eq("messageId", message._id).eq("userId", user._id))
      .collect();
    const existing = mine.find((r) => r.emoji === emoji);
    if (existing) await ctx.db.delete(existing._id);
    else await ctx.db.insert("reactions", { messageId: message._id, userId: user._id, emoji });
  },
});

/**
 * The storage id of photo `index` in a message, if the caller may see it
 * (an active member of the conversation's hub). Used by the `/chat-image`
 * HTTP route, so photo URLs never leave the access check (HUB-20).
 */
export const imageForViewer = internalQuery({
  args: { messageId: v.id("messages"), index: v.number() },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (message === null || message.deletedAt !== undefined) return null;
    if ((await getConversationAccess(ctx, message.conversationId)) === null) return null;
    return message.imageIds[args.index] ?? null;
  },
});

/** Validates a message id from a URL. */
export const normalizeMessageId = internalQuery({
  args: { id: v.string() },
  handler: (ctx, args) => ctx.db.normalizeId("messages", args.id),
});
